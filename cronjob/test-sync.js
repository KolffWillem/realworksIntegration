const syncRealwork = require("./sync-realworks-data");

async function testSync() {
  console.log("🧪 Starting test sync at", new Date().toISOString());
  try {
    await syncRealwork();
    console.log("✅ Test sync completed at", new Date().toISOString());
  } catch (err) {
    console.error("❌ Test sync failed:", err);
  }
}

// Run the test
testSync(); 