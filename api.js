const express = require("express");
const cors = require("cors");
const { init, checkZones } = require("./ws_com");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

let db;

/* ---------------------- INDEX INITIALIZATION ---------------------- */
async function ensureIndexes(db) {
  await db.collection("bins").createIndex({ binId: 1 }, { unique: true });
  await db.collection("bins").createIndex({ zoneCode: 1 });
  await db.collection("bins_meta").createIndex({ binId: 1 }, { unique: true });
  await db
    .collection("last_positions")
    .createIndex({ slamCoreId: 1 }, { unique: true });
  await db
    .collection("all_positions")
    .createIndex({ deviceId: 1, "pose.timestamp": -1 });
  await db.collection("bin_events").createIndex({ binId: 1, timestamp: -1 });
  await db
    .collection("zone_events")
    .createIndex({ deviceId: 1, timestamp: -1 });
  await db.collection("zones").createIndex({ code: 1 }, { unique: true });
  await db.collection("zones").createIndex({ active: 1 });
  console.log("✅ Indexes ensured");
}

/* ---------------------- ROUTES ---------------------- */

/**
 * 1️⃣ Get last position data by slamCoreId
 * GET /api/last-position/:slamCoreId
 */
app.get("/api/last-position/:slamCoreId", async (req, res) => {
  try {
    const { slamCoreId } = req.params;
    const data = await db.collection("last_positions").findOne({ slamCoreId });
    if (!data) return res.status(404).json({ message: "No data found" });
    res.json(data);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 2️⃣ Get all position history
 * GET /api/all-positions
 * Optional query params: slamCoreId, limit
 */
app.get("/api/all-positions", async (req, res) => {
  try {
    const { slamCoreId, limit = 100 } = req.query;
    const filter = slamCoreId ? { deviceId: slamCoreId } : {};
    const data = await db
      .collection("all_positions")
      .find(filter)
      .sort({ "pose.timestamp": -1 })
      .limit(Number(limit))
      .toArray();

    res.json(data);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 3️⃣ All bin positions
 * GET /api/bins → get all
 * POST /api/bins → create/update
 */
app.get("/api/bins", async (req, res) => {
  try {
    const bins = await db.collection("bins").find({}).toArray();
    res.json(bins);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST or PUT for adding/updating bin position, load/unload info
app.post("/api/bins", async (req, res) => {
  try {
    const { binId, load, unload, forkliftId } = req.body;
    if (!binId) return res.status(400).json({ error: "binId is required" });
    if (!load && !unload)
      return res.status(400).json({ error: "Must specify load or unload" });

    const lastPose = forkliftId
      ? await db
          .collection("last_positions")
          .findOne({ slamCoreId: forkliftId })
      : null;
    const pose = lastPose?.pose || null;
    const matchedZone = pose ? checkZones(pose) : null;
    if (!pose) console.warn(`⚠️ No pose found for forklift ${forkliftId}`);

    let update;
    if (load) {
      // Forklift picked up bin
      update = {
        $set: {
          load: true,
          unload: false,
          carriedBy: forkliftId,
          position: pose
            ? { x: pose.x, y: pose.y, z: pose.z, timestamp: pose.timestamp }
            : null,
          zoneCode: matchedZone ? matchedZone.code : "outside",
          updatedAt: new Date(),
        },
      };

      await db.collection("bin_events").insertOne({
        binId,
        event: "load",
        forkliftId,
        zoneCode: matchedZone ? matchedZone.code : "outside",
        position: pose,
        timestamp: new Date(),
      });

      console.log(`📦 Bin ${binId} loaded by forklift ${forkliftId}`);
    } else if (unload) {
      // Forklift dropped bin
      update = {
        $set: {
          load: false,
          unload: true,
          carriedBy: null,
          position: pose
            ? { x: pose.x, y: pose.y, z: pose.z, timestamp: pose.timestamp }
            : null,
          zoneCode: matchedZone ? matchedZone.code : "outside",
          updatedAt: new Date(),
        },
      };

      await db.collection("bin_events").insertOne({
        binId,
        event: "unload",
        forkliftId,
        zoneCode: matchedZone ? matchedZone.code : "outside",
        position: pose,
        timestamp: new Date(),
      });

      console.log(
        `📦 Bin ${binId} unloaded in zone ${matchedZone?.code || "outside"}`
      );
    }

    const result = await db
      .collection("bins")
      .updateOne(
        { binId },
        { ...update, $setOnInsert: { binId, createdAt: new Date() } },
        { upsert: true }
      );

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 4️⃣ Create bin or get bin details
 * POST /api/bin → create
 * GET /api/bin/:binId → fetch by id
 */
app.post("/api/bin", async (req, res) => {
  try {
    const { binId, type, description } = req.body;
    if (!binId || !type)
      return res.status(400).json({ error: "binId and type are required" });

    const doc = {
      binId,
      type,
      description: description || "",
      createdAt: new Date(),
    };
    await db.collection("bins_meta").insertOne(doc);

    res.status(201).json({ success: true, bin: doc });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bin/:binId", async (req, res) => {
  try {
    const { binId } = req.params;
    const bin = await db.collection("bins_meta").findOne({ binId });
    if (!bin) return res.status(404).json({ message: "Bin not found" });
    res.json(bin);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * 5️⃣ SMART SEARCH
 * GET /api/search?binId=BIN123
 * GET /api/search?zone=ZONE_CODE
 */
app.get("/api/search", async (req, res) => {
  try {
    const { binId, zone } = req.query;

    if (!binId && !zone)
      return res.status(400).json({ error: "Specify binId or zone" });

    let result = {};

    if (binId) {
      const bin = await db.collection("bins").findOne({ binId });
      if (!bin) return res.status(404).json({ error: "Bin not found" });

      const zoneEvents = bin.carriedBy
        ? await db
            .collection("zone_events")
            .find({ deviceId: bin.carriedBy })
            .sort({ timestamp: -1 })
            .limit(10)
            .toArray()
        : await db
            .collection("bin_events")
            .find({ binId })
            .sort({ timestamp: -1 })
            .limit(10)
            .toArray();

      const lastEvent = zoneEvents[0];
      result = {
        binId,
        currentZone: bin.zoneCode,
        lastPosition: bin.position,
        lastZoneEntry: lastEvent ? lastEvent.timestamp : null,
        zoneHistory: zoneEvents,
      };
    }

    if (zone) {
      const binsInZone = await db
        .collection("bins")
        .find({ zoneCode: zone })
        .toArray();
      result = { zone, bins: binsInZone };
    }

    res.json(result);
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------- EXPORT FUNCTION ---------------------- */
async function startApiServer(database) {
  db = database;

  await ensureIndexes(db);

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`🚀 API running on port ${PORT}`));
}

module.exports = { startApiServer };
