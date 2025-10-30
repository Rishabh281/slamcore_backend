require("dotenv").config();
const { init } = require("./ws_com");
const { startApiServer } = require("./api");
const { MongoClient } = require("mongodb");

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME;

    // Connect once and share the instance
    const client = new MongoClient(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await client.connect();
    const db = client.db(dbName);

    console.log("✅ Main connected to MongoDB");

    // Start WebSocket + zone system (pass db if you refactor ws_com to accept it)
    await init(db);

    // Start REST API server
    startApiServer(db);

    console.log("🚀 System fully operational");
  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    process.exit(1);
  }
})();
