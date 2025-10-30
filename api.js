const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

let db;

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
    const { binId, position, load, unload } = req.body;
    if (!binId) return res.status(400).json({ error: "binId is required" });

    const update = {
      $set: {
        binId,
        position: position || null,
        load: load || false,
        unload: unload || false,
        updatedAt: new Date(),
      },
    };

    const result = await db
      .collection("bins")
      .updateOne({ binId }, update, { upsert: true });

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

    const doc = { binId, type, description: description || "", createdAt: new Date() };
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


/* ---------------------- EXPORT FUNCTION ---------------------- */
function startApiServer(database) {
  db = database;
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`🚀 API running on port ${PORT}`));
}

module.exports = { startApiServer };