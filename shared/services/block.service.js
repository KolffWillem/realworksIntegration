const supabase = require("../../supabaseClient");

class BlockService {
  create = async ({
    realworkId,
    startTime,
    endTime,
    date,
    projectId,
    profileId,
    createdBy,
    duration,
    parties,
    integration,
  }) => {
    try {
      let slots = [];
      let currentTime = new Date(startTime);
      let lastSlotStart = null;
      let blockEndTime = endTime;

      console.log(
        `Creating block for project ${projectId} on ${date} from ${startTime} to ${endTime}`
      );

      while (
        currentTime.getTime() + duration * 60000 <=
        new Date(endTime).getTime()
      ) {
        lastSlotStart = new Date(currentTime);
        slots.push({
          block_id: null, // We'll update this after block creation
          project_id: projectId,
          start_time: currentTime.toTimeString().slice(0, 5),
          max_groups: parties,
          duration,
          date,
          profile_id: profileId,
          created_by: createdBy,
        });

        currentTime = new Date(currentTime.getTime() + duration * 60000);
      }

      if (lastSlotStart) {
        const lastSlotEnd = new Date(
          lastSlotStart.getTime() + duration * 60000
        );
        blockEndTime = lastSlotEnd.toTimeString().slice(0, 5);
      }

      console.log(`Generated ${slots.length} slots for the block`);

      const { data: block, error } = await supabase
        .from("blocks")
        .insert([
          {
            project_id: projectId,
            duration,
            start_time: startTime,
            end_time: blockEndTime,
            date,
            profile_id: profileId,
            created_by: createdBy,
            is_broker_block: false,
            interval_time: 0,
            parties,
          },
        ])
        .select();

      if (error) {
        console.log("Error creating block:", error);
        throw error;
      }

      console.log(
        `Block created with ID ${block[0].id}, now creating ${slots.length} slots`
      );

      slots = slots.map((x) => ({ ...x, block_id: block[0].id }));

      const { data: slotsData, error: slotsError } = await supabase
        .from("slots")
        .insert(slots)
        .select();

      if (slotsError) {
        console.log("Error creating slots:", slotsError);
        throw slotsError;
      }

      console.log(`Created ${slotsData.length} slots for block ${block[0].id}`);

      // Create external attribute
      await supabase.from("external_attributes").insert([
        {
          entity_id: block[0].id,
          entity_type: "block",
          attribute_name: "blockId",
          attribute_value: realworkId,
          integration_instance_id: integration.id,
        },
      ]);

      console.log(
        `Created external attribute for block ${block[0].id} with realworkId ${realworkId}`
      );

      return block;
    } catch (error) {
      console.error(`Error in block creation process:`, error);
      throw error;
    }
  };

  updateTime = async ({ id, startTime, endTime, date }) => {
    await supabase
      .from("blocks")
      .update({
        start_time: startTime,
        end_time: endTime,
        date,
      })
      .eq("id", id);
  };
}

module.exports = new BlockService();
