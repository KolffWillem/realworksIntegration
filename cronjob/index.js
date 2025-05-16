const cron = require("node-cron");
const syncRealwork = require("./sync-realworks-data");

cron.schedule("0 0 * * * *", async () => {
  console.log("⏰ Starting job at", new Date().toISOString());
  try {
    await syncRealwork();

    console.log("✅ Sync date at", new Date().toISOString());
  } catch (err) {
    console.error("❌ Job failed:", err);
  }
});
