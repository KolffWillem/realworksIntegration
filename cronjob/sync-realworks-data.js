const supabase = require("../supabaseClient");

const chunkArray = require("../shared/utils/chunkArray");
const convertToMap = require("../shared/utils/convertToMap");
const getBlockParties = require("../shared/utils/getBlockParties");
const realworkService = require("../shared/services/realwork.service");
const blockService = require("../shared/services/block.service");
const slotService = require("../shared/services/slot.service");
const bookingService = require("../shared/services/booking.service");
const moment = require("moment");
const fullData = require("./full-data");

const saveExternalMappings = async (externalMappings) => {
  await supabase.from("external_mappings").insert(externalMappings);
};

const processSyncStatusAndTypes = async (integration) => {
  const { data: externalMappings } = await supabase
    .from("external_mappings")
    .select("*")
    .eq("integration_instance_id", integration.id);

  const statuses = [];
  const types = [];
  const statusExternalIds = [];
  const typesExternalIds = [];

  externalMappings.forEach((x) => {
    if (x.type === "type") {
      types.push(x);
      typesExternalIds.push(x.external_id);
    } else {
      statuses.push(x);
      statusExternalIds.push(x.external_id);
    }
  });

  const [realworkTypes, realworkStatuses] = await Promise.all([
    realworkService.getFirmTypes(integration.firm_id),
    realworkService.getFirmStatuses(integration.firm_id),
  ]);

  const typesToSave = realworkTypes
    .filter((x) => !typesExternalIds.includes(String(x.systemid)))
    .map((x) => ({
      external_id: x.systemid,
      external_name: x.type,
      type: "type",
      integration_instance_id: integration.id,
    }));

  const statusesToSave = realworkStatuses
    .filter((x) => !statusExternalIds.includes(String(x.systemid)))
    .map((x) => ({
      external_id: x.systemid,
      external_name: x.status,
      type: "status",
      integration_instance_id: integration.id,
    }));

  await saveExternalMappings([...typesToSave, ...statusesToSave]);

  return { statuses };
};

const processBookingsToUpdate = async (
  realworkBookings,
  dbBookings,
  statusMap
) => {
  const dbBookingIds = dbBookings.map((x) => x.entity_id);

  const { data: bookings } = await supabase
    .from("bookings")
    .select("*, slot:slot_id(*)")
    .in("id", dbBookingIds);

  for await (const dbBooking of dbBookings) {
    const realworkBooking = realworkBookings.find(
      (x) => x.id === Number(dbBooking.attribute_value)
    );
    const booking = bookings.find((x) => x.id === dbBooking.entity_id);
    if (!realworkBooking || !booking) continue;

    // BROKER CHECKING
    const realworkBrokerId = realworkBooking?.relaties?.find(
      (x) => x.type === "Agendapunt voor"
    )?.id;

    if (!realworkBrokerId) continue;

    const dbBrokerId = await realworkService.findBrokerByRealworkId(
      realworkBrokerId
    );

    if (!dbBrokerId) {
      console.log("This broker is not connected to our system");
      continue;
    }

    if (dbBrokerId !== booking.slot.profile_id) {
      // console.log(
      //   "slot profile id need update:",
      //   booking.slot.profile_id,
      //   dbBrokerId
      // );
      await supabase
        .from("slots")
        .update({
          profile_id: dbBrokerId,
        })
        .eq("id", booking.slot.id);
    }

    const bookingStartTime = moment(
      `${booking.slot.date} ${booking.slot.start_time}`
    );
    const bookingEndTime = moment(bookingStartTime).add(
      booking.slot.duration,
      "minutes"
    );
    const realworkStartTime = moment(realworkBooking.begintijd);
    const realworkEndTime = moment(realworkBooking.eindtijd);

    if (
      !bookingStartTime.isSame(realworkStartTime) ||
      !bookingEndTime.isSame(realworkEndTime)
    ) {
      //TODO: refactor slotToMove to service
      const { data: slots } = await supabase
        .from("slots")
        .select("*, bookings(id)")
        .eq("block_id", booking.slot.block_id);

      let slotToMove = slots.find((slot) => {
        // if (slot.bookings.length === slot.max_groups) return false;
        const slotTime = moment(`${slot.date} ${slot.start_time}`);
        return slotTime.isSame(realworkStartTime);
      });

      if (!slotToMove) {
        const { data: newSlot } = await supabase
          .from("slots")
          .insert([
            {
              ...booking.slot,
              start_time: realworkBooking.begintijd.split(" ")[1],
              duration: realworkEndTime.diff(realworkStartTime, "minutes"),
            },
          ])
          .select()
          .single();
        slotToMove = newSlot;
      }
      if (slotToMove) {
        // console.log("booking need update:", booking, realworkBooking);
        await supabase
          .from("bookings")
          .update({
            slot_id: slotToMove.id,
          })
          .eq("id", booking.id);
      }
    }

    // STATUS CHECKING
    const mappedRealworkStatus = statusMap[realworkBooking.status];
    if (mappedRealworkStatus !== booking.status) {
      // console.log("booking need update:", booking);
      await supabase
        .from("bookings")
        .update({
          status: mappedRealworkStatus,
        })
        .eq("id", booking.id);
    }
  }
};

const processNewBookings = async (
  realworkBookings,
  statusMap,
  integration,
  blockId = null
) => {
  for await (const realworkBooking of realworkBookings) {
    if (realworkBooking.status === "Geannuleerd") continue;

    console.log(realworkBooking);

    // PROJECT CHECKING
    // if (!realworkBooking?.project?.projectcode) {
    //   continue;
    // }

    //TODO: remove
    const realworkProjectCode =
      "123456" ?? realworkBooking?.project?.projectcode;

    const projectId = await realworkService.findProjectByProjectCode(
      realworkProjectCode
    );

    if (!projectId) {
      console.log("Project not found", realworkProjectCode);
      continue;
    }

    // BROKER CHECKING
    const realworkBrokerId = realworkBooking?.relaties?.find(
      (x) => x.type === "Agendapunt voor"
    )?.id;

    if (!realworkBrokerId) continue;

    const profileId = await realworkService.findBrokerByRealworkId(
      realworkBrokerId
    );

    if (!profileId) {
      console.log(
        "This broker is not connected to our system",
        realworkBrokerId
      );
      continue;
    }

    // GET CREATED BY
    const realworkCreatedBy = realworkBooking?.relaties?.find(
      (x) => x.type === "Geplaatst door (medewerker)"
    )?.id;

    if (!realworkCreatedBy) continue;

    const createdById = await realworkService.findBrokerByRealworkId(
      realworkCreatedBy
    );

    if (!createdById) {
      console.log(
        "This broker is not connected to our system",
        realworkCreatedBy
      );
      continue;
    }

    // GET CLIENT ID
    const realworkClientId = realworkBooking?.relaties?.find(
      (x) => x.type === "Geplaatst door (medewerker)"
    )?.id;

    if (!realworkClientId) continue;

    const clientId = await realworkService.findClientByRealworkId(
      realworkClientId
    );

    if (!clientId) {
      console.log(
        "This client is not connected to our system",
        realworkClientId
      );
      continue;
    }

    const startTime = realworkBooking.begintijd;
    const endTime = realworkBooking.eindtijd;

    const date = startTime.split(" ")[0];

    const mappedRealworkStatus = statusMap[realworkBooking.status];

    let blocks;

    if (blockId) {
      const { data } = await supabase
        .from("blocks")
        .select("*, slots(*)")
        .eq("id", blockId);
      blocks = data;
    }

    if (!blocks?.length) {
      const { data } = await supabase
        .from("blocks")
        .select("*, slots(*)")
        .eq("profile_id", profileId)
        .eq("date", date)
        .eq("project_id", projectId);

      blocks = data;
    }

    const findBlocks = blocks.filter((block) => {
      const blockStartTime = moment(`${block.date} ${block.start_time}`);
      const blockEndTime = moment(`${block.date} ${block.end_time}`);

      return (
        blockStartTime.isSameOrBefore(moment(startTime)) &&
        blockEndTime.isSameOrAfter(moment(endTime))
      );
    });

    let availableSlot, availableBlock;

    //TODO: check if slot has booking also
    findBlocks.forEach((block) => {
      block.slots.forEach((slot) => {
        const slotStartTime = moment(`${slot.date} ${slot.start_time}`);

        if (slotStartTime.isSame(moment(startTime))) {
          availableSlot = slot.id;
          availableBlock = block.id;
        }
      });
    });

    if (availableBlock && availableSlot) {
      await bookingService.createBookingInSlot({
        slotId: availableSlot,
        clientId,
        projectId,
        profileId,
        startTime,
        endTime,
        status: mappedRealworkStatus,
        integration,
        realworkId: realworkBooking.id,
      });
    } else {
      await bookingService.createNewAppointment({
        date,
        startTime,
        endTime,
        profileId,
        projectId,
        createdBy: createdById,
        clientId,
        stauts: mappedRealworkStatus,
        integration,
        realworkId: realworkBooking.id,
      });
    }
  }
};

const processUpdateBlock = async (
  realworkBlocks,
  dbBlocks,
  statusMap,
  integration
) => {
  const dbBlockIds = dbBlocks.map((x) => x.entity_id);

  const { data: blocks } = await supabase
    .from("blocks")
    .select("*, slots(*)")
    .in("id", dbBlockIds);

  for await (const dbBlock of dbBlocks) {
    const realworkBlock = realworkBlocks.find(
      (x) => x.id === Number(dbBlock.attribute_value)
    );
    const block = blocks.find((x) => x.id === dbBlock.entity_id);

    // console.log(realworkBlock, block);
    if (!realworkBlock || !block) continue;

    //TODO: remove
    const realworkProjectCode = "123456" ?? realworkBlock?.project?.projectcode;

    const projectId = await realworkService.findProjectByProjectCode(
      realworkProjectCode
    );

    if (!projectId) {
      console.log("Project not found", realworkProjectCode);
      continue;
    }

    // BROKER CHECKING
    const realworkBrokerId = realworkBlock?.relaties?.find(
      (x) => x.type === "Agendapunt voor"
    )?.id;

    if (!realworkBrokerId) continue;

    const profileId = await realworkService.findBrokerByRealworkId(
      realworkBrokerId
    );

    if (!profileId) {
      console.log(
        "This broker is not connected to our system",
        realworkBrokerId
      );
      continue;
    }

    // GET CREATED BY
    const realworkCreatedBy = realworkBlock?.relaties?.find(
      (x) => x.type === "Geplaatst door (medewerker)"
    )?.id;

    if (!realworkCreatedBy) continue;

    const createdById = await realworkService.findBrokerByRealworkId(
      realworkCreatedBy
    );

    if (!createdById) {
      console.log(
        "This broker is not connected to our system",
        realworkBrokerId
      );
      continue;
    }

    if (profileId !== block.profile_id) {
      await supabase
        .from("blocks")
        .update({ profile_id: profileId })
        .eq("id", block.id);
      await supabase
        .from("slots")
        .update({ profile_id: profileId })
        .eq("block_id", profileId);
    }

    const blockStartTime = moment(`${block.date} ${block.start_time}`);
    const blockEndTime = moment(`${block.date} ${block.end_time}`);
    const realworkBlockStartTime = moment(realworkBlock.begintijd);
    const realworkBlockEndTime = moment(realworkBlock.eindtijd);

    //update block time and delete slots, bookings fall out side time range
    if (
      !blockStartTime.isSame(realworkBlockStartTime) ||
      !blockEndTime.isSame(realworkBlockEndTime)
    ) {
      const slotsOutSideBlock = block.slots.filter((slot) => {
        const slotTime = moment(`${slot.date} ${slot.start_time}`);
        return !slotTime.isBetween(
          realworkBlockStartTime,
          realworkBlockEndTime,
          null,
          "[]"
        );
      });

      if (slotsOutSideBlock.length) {
        await slotService.deleteByIds(slotsOutSideBlock.map((x) => x.id));
      }

      const [date, startTime] = realworkBlock.begintijd.split(" ");
      const [_, endTime] = realworkBlock.eindtijd.split(" ");
      await blockService.updateTime({
        id: block.id,
        startTime,
        endTime,
        date,
      });
    }

    //delete bookings create in housap but deleted in realworks
    const slotIds = block.slots.map((x) => x.id);

    const bookingsWithRealworkId =
      await bookingService.getBookingsWithRealworkId(slotIds);

    const bookingsToDelete = bookingsWithRealworkId.filter((booking) => {
      if (!booking.realworkId) {
        return true;
      }
      const existInRealwork = realworkBlock.bookings.find(
        (x) => x.id === Number(booking.realworkId)
      );

      return existInRealwork ? false : true;
    });

    if (bookingsToDelete.length) {
      await bookingService.deleteByIds(bookingsToDelete.map((x) => x.id));
    }

    //process bookings like other bookings flow
    const realworkBookingIds = realworkBlock.bookings.map((x) => x.id);

    const { data: bookingsWithAgendaId } = await supabase
      .from("external_attributes")
      .select("entity_id, attribute_value")
      .eq("attribute_name", "agendaId")
      .eq("entity_type", "booking")
      .in("attribute_value", realworkBookingIds);

    const realworkBookingIdsToUpdate = new Set(
      bookingsWithAgendaId.map((x) => Number(x.attribute_value))
    );

    const updateBookings = [];
    const newBookings = [];

    realworkBlock.bookings.forEach((agendaPoint) => {
      if (realworkBookingIdsToUpdate.has(agendaPoint.id)) {
        updateBookings.push(agendaPoint);
      } else {
        newBookings.push(agendaPoint);
      }
    });

    await Promise.all([
      processBookingsToUpdate(updateBookings, bookingsWithAgendaId, statusMap),
      processNewBookings(newBookings, statusMap, integration),
    ]);
  }
};

const processNewBlock = async (realworkBlocks, statusMap, integration) => {
  for await (const realworkBlock of realworkBlocks) {
    console.log(realworkBlock);

    //TODO: remove
    const realworkProjectCode = "123456" ?? realworkBlock?.project?.projectcode;

    const projectId = await realworkService.findProjectByProjectCode(
      realworkProjectCode
    );

    if (!projectId) {
      console.log("Project not found", realworkProjectCode);
      continue;
    }

    // BROKER CHECKING
    const realworkBrokerId = realworkBlock?.relaties?.find(
      (x) => x.type === "Agendapunt voor"
    )?.id;

    if (!realworkBrokerId) continue;

    const profileId = await realworkService.findBrokerByRealworkId(
      realworkBrokerId
    );

    if (!profileId) {
      console.log(
        "This broker is not connected to our system",
        realworkBrokerId
      );
      continue;
    }

    // GET CREATED BY
    const realworkCreatedBy = realworkBlock?.relaties?.find(
      (x) => x.type === "Geplaatst door (medewerker)"
    )?.id;

    if (!realworkCreatedBy) continue;

    const createdById = await realworkService.findBrokerByRealworkId(
      realworkCreatedBy
    );

    if (!createdById) {
      console.log(
        "This broker is not connected to our system",
        realworkBrokerId
      );
      continue;
    }

    const realworkBlockBookings = realworkBlock.bookings.filter(
      (x) => x.status !== "Geannuleerd"
    );

    if (!realworkBlockBookings.length) continue;
    const duration = moment(realworkBlockBookings[0].eindtijd).diff(
      moment(realworkBlockBookings[0].begintijd),
      "minutes"
    );
    const parties = getBlockParties(realworkBlockBookings);

    const startTime = realworkBlock.begintijd;
    const endTime = realworkBlock.eindtijd;

    const date = startTime.split(" ")[0];

    const block = await blockService.create({
      realworkId: realworkBlock.id,
      startTime,
      endTime,
      date,
      profileId,
      createdBy: createdById,
      projectId,
      duration,
      parties,
      integration,
    });

    await processNewBookings(
      realworkBlockBookings,
      statusMap,
      integration,
      block.id
    );
  }
};

const processIntegrationSync = async (integration) => {
  const { statuses } = await processSyncStatusAndTypes(integration);
  const statusMap = convertToMap(statuses, "external_name", "housap_type");

  const realworkAgenda =
    fullData.resultaten ??
    (await realworkService.getFirmAgenda(integration.firm_id));

  let realworkBookings = [];
  let realworkBlocks = [];

  realworkAgenda.forEach((agenda) => {
    //TODO: may need update
    if (agenda.agendatype === "Bezichtiging blokken") {
      realworkBlocks.push(agenda);
    } else {
      realworkBookings.push(agenda);
    }
  });

  const bookingWithABlock = new Set();

  realworkBlocks = realworkBlocks.map((block) => {
    const blockBrokerId = block?.relaties?.find(
      (x) => x.type === "Agendapunt voor"
    )?.id;
    const projectCode = block.project.projectcode;

    const bookings = realworkBookings.filter((booking) => {
      const bookingBrokerId = booking?.relaties?.find(
        (x) => x.type === "Agendapunt voor"
      )?.id;
      const bookingProjectCode = booking.project.projectcode;

      if (
        bookingProjectCode === projectCode &&
        bookingBrokerId === blockBrokerId &&
        moment(block.begintijd).isSameOrBefore(booking.begintijd) &&
        moment(block.eindtijd).isSameOrAfter(booking.eindtijd)
      ) {
        bookingWithABlock.add(booking.id);
        return true;
      } else {
        return false;
      }
    });

    return {
      ...block,
      bookings,
    };
  });

  const realworkBlockIds = realworkBlocks.map((x) => x.id);

  const { data: blocksWithAgendaId } = await supabase
    .from("external_attributes")
    .select("entity_id, attribute_value")
    .eq("attribute_name", "blockId")
    .eq("entity_type", "block")
    .in("attribute_value", realworkBlockIds);

  const realworkBlockIdsToUpdate = new Set(
    blocksWithAgendaId.map((x) => Number(x.attribute_value))
  );

  const updateBlocks = [];
  const newBlocks = [];

  realworkBlocks.forEach((block) => {
    if (realworkBlockIdsToUpdate.has(block.id)) {
      updateBlocks.push(block);
    } else {
      newBlocks.push(block);
    }
  });

  await Promise.all([
    processUpdateBlock(
      [updateBlocks.find((x) => x.id == 226100326)],
      blocksWithAgendaId,
      statusMap,
      integration
    ),
    processNewBlock([newBlocks[1]], statusMap, integration),
  ]);

  const bookingsWithoutBlock = realworkBlocks.filter(
    (x) => !bookingWithABlock.has(x.id)
  );

  const realworkBookingIds = bookingsWithoutBlock.map((x) => x.id);

  const { data: bookingsWithAgendaId } = await supabase
    .from("external_attributes")
    .select("entity_id, attribute_value")
    .eq("attribute_name", "agendaId")
    .eq("entity_type", "booking")
    .in("attribute_value", realworkBookingIds);

  const realworkBookingIdsToUpdate = new Set(
    bookingsWithAgendaId.map((x) => Number(x.attribute_value))
  );

  const updateBookings = [];
  const newBookings = [];

  bookingsWithoutBlock.forEach((agendaPoint) => {
    if (realworkBookingIdsToUpdate.has(agendaPoint.id)) {
      updateBookings.push(agendaPoint);
    } else {
      newBookings.push(agendaPoint);
    }
  });

  //TODO: update after done
  await Promise.all([
    processBookingsToUpdate(updateBookings, bookingsWithAgendaId, statusMap),
    processNewBookings([newBookings[0]], statusMap, integration),
  ]);
};

async function syncRealwork() {
  try {
    const integrations = await realworkService.getIntegrationsToSync();

    const chunks = chunkArray(
      integrations.filter(
        //TODO: update after done
        (x) => x.firm_id === "910041e5-8c42-4fb2-b812-ea21875b8072"
      ),
      5
    );

    //process only 5 integrations at a time
    for (const chunk of chunks) {
      await Promise.all(chunk.map((x) => processIntegrationSync(x)));
    }

    console.log("Syncing done");
  } catch (error) {
    throw error;
  }
}

module.exports = syncRealwork;
