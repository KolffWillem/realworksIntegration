const moment = require("moment");
const supabase = require("../../supabaseClient");
const { sendEmailAndNotification } = require("./email.service");

class BookingService {
  createNewAppointment = async ({
    date,
    startTime,
    endTime,
    profileId,
    projectId,
    createdBy,
    clientId,
    status = "booked",
    integration,
    realworkId,
  }) => {
    const duration = moment(endTime).diff(moment(startTime), "minutes");

    const { data: block, error: blockError } = await supabase
      .from("blocks")
      .insert([
        {
          date,
          start_time: startTime,
          end_time: endTime,
          profile_id: profileId,
          project_id: projectId,
          created_by: createdBy,
          parties: 1,
          interval_time: 0,
          duration,
        },
      ])
      .select("*, project:project_id(*)")
      .single();

    if (blockError) {
      throw blockError;
    }

    const { data: slot, error: slotError } = await supabase
      .from("slots")
      .insert([
        {
          block_id: block.id,
          project_id: block.project_id,
          start_time: startTime.split(" ")[1],
          max_groups: block.parties,
          duration: duration,
          date: block.date,
          profile_id: block.profile_id,
          created_by: block.created_by,
        },
      ])
      .select("*")
      .single();

    if (slotError) {
      throw slotError;
    }

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert([
        {
          slot_id: slot.id,
          client_id: clientId,
          status,
          for_someone_else: false,
        },
      ])
      .select("*, client:client_id(*)")
      .single();

    if (bookingError) {
      throw bookingError;
    }

    await supabase.from("external_attributes").insert([
      {
        entity_id: booking.id,
        entity_type: "booking",
        attribute_name: "agendaId",
        attribute_value: realworkId,
        integration_instance_id: integration.id,
      },
    ]);

    await this.sendMail({
      clientId,
      booking,
      projectId,
      profileId,
      integration,
      duration,
    });
  };

  createBookingInSlot = async ({
    slotId,
    clientId,
    projectId,
    profileId,
    startTime,
    endTime,
    status,
    integration,
    realworkId,
  }) => {
    const duration = moment(endTime).diff(moment(startTime), "minutes");

    await supabase.from("slots").update({ duration }).eq("id", slotId);

    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert([
        {
          slot_id: slotId,
          client_id: clientId,
          status,
          for_someone_else: false,
        },
      ])
      .select("*, client:client_id(*)")
      .single();

    if (bookingError) {
      throw bookingError;
    }

    await supabase.from("external_attributes").insert([
      {
        entity_id: booking.id,
        entity_type: "booking",
        attribute_name: "agendaId",
        attribute_value: realworkId,
        integration_instance_id: integration.id,
      },
    ]);

    await this.sendMail({
      clientId,
      booking,
      projectId,
      profileId,
      integration,
      duration,
    });
  };

  sendMail = async ({
    clientId,
    booking,
    projectId,
    profileId,
    integration,
    duration,
  }) => {
    const emailResult = await sendEmailAndNotification({
      event: "notification_appointment_confirmation",
      client_id: clientId,
      project_id: projectId,
      booking_id: booking.id,
      profile_id: profileId,
      firm_id: integration.firm_id,
      skipBrokerNotification: true, // Only notify broker if explicitly requested
      additionalVariables: {
        duration,
        cancel_url: encodeURI(
          `${process.env.NEXT_PUBLIC_BASE_URL}/cancel-booking/${booking.id}?lang=${booking.client.language}`
        ),
        reschedule_url: encodeURI(
          `${process.env.NEXT_PUBLIC_BASE_URL}/reschedule-booking/${booking.id}?lang=${booking.client.language}`
        ),
      },
    });

    if (!emailResult.success) {
      console.error("Error sending emails:", emailResult);
      // Continue processing - booking was created
    }
  };

  getBookingsWithRealworkId = async (slotIds) => {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("*")
      .in("slot_id", slotIds);

    const bookingIds = bookings.map((x) => x.id);

    const { data: externalBooking } = await supabase
      .from("external_attributes")
      .select("entity_id, attribute_value")
      .eq("entity_type", "booking")
      .in("entity_id", bookingIds);

    return bookings.map((booking) => {
      const realworkId = externalBooking.find(
        (x) => x.entity_id === booking.id
      )?.attribute_value;

      return {
        ...booking,
        realworkId,
      };
    });
  };

  deleteByIds = async (ids) => {
    await supabase.from("bookings").delete().in("id", ids);
  };
}

module.exports = new BookingService();
