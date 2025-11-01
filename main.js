// require("dotenv").config();
const { init } = require("./ws_com");
const { startApiServer } = require("./api");
const { ensureDatabaseSchema, ensureZonesData } = require("./database");
const { MongoClient } = require("mongodb");

(async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.DB_NAME;

    // Connect once and share the instance
    if (!mongoUri || !dbName) {
      throw new Error("Missing MONGODB_URI or DB_NAME in environment");
    }

    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db(dbName);
    await db.command({ ping: 1 });

    console.log("✅ MongoDB connected and verified:", dbName);
    await ensureDatabaseSchema(db);
    await ensureZonesData(db);

    // Start WebSocket + zone system (pass db if you refactor ws_com to accept it)
    await init(db);

    // Start REST API server
    startApiServer(db);

    console.log("🚀 System fully operational");

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}, closing MongoDB...`);
      await client.close();
      console.log("🛑 MongoDB connection closed");
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

  } catch (err) {
    console.error("❌ Fatal startup error:", err);
    process.exit(1);
  }
})();
