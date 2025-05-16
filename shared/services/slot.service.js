const supabase = require("../../supabaseClient");

class SlotService {
  deleteByIds = async (ids) => {
    await supabase.from("slots").delete().in("id", ids);
    await supabase.from("bookings").delete().in("slot_id", ids);
  };
}

module.exports = new SlotService();
