const io = require("socket.io-client");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;
const wsUri = process.env.WS_URI;

let db;
let zones = [];

/* ---------------------- CONNECT TO MONGO ---------------------- */
async function connectDB() {
  const client = new MongoClient(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  db = client.db(dbName);
  console.log("✅ Connected to MongoDB");

  zones = await db.collection("zones").find({ active: true }).toArray();
  console.log(`Loaded ${zones.length} active zones`);

  // Optional: Check last known positions on startup
  const lastPositions = await db
    .collection("last_positions")
    .find({})
    .toArray();
  console.log(`Loaded ${lastPositions.length} documents from last_positions`);

  for (const doc of lastPositions) {
    if (doc && doc.pose) {
      const matchedZone = checkZones(doc.pose);
      if (matchedZone) {
        console.log(`✅ Pose inside zone ${matchedZone.code}`);
      } else {
        console.log(
          `❌ Pose outside all zones: (${doc.pose.x}, ${doc.pose.y})`
        );
      }
    }
  }
}

/* ---------------------- GEOMETRY UTILITIES ---------------------- */
function parsePolygonWKT(wkt) {
  try {
    const coordsString = wkt.match(/\(\((.*?)\)\)/)[1];
    return coordsString.split(",").map((pair) => {
      const [x, y] = pair.trim().split(" ").map(Number);
      return [x, y];
    });
  } catch (err) {
    console.error("⚠️ Invalid WKT boundary:", wkt);
    return [];
  }
}

function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

function checkZones(pose) {
  const point = [pose.x, pose.y];

  for (const zone of zones) {
    const polygonCoords = parsePolygonWKT(zone.boundary);

    if (pointInPolygon(point, polygonCoords)) {
      if (pose.z >= zone.zmin && pose.z <= zone.zmax) {
        onPositionInZone(pose, zone);
        return zone;
      }
    }
  }

  return null;
}

/* ---------------------- POSE DATA VALIDATION ---------------------- */

function validatePose(pose) {
  const requiredFields = ["x", "y", "z", "qx", "qy", "qz", "qw", "timestamp"];
  for (const f of requiredFields) {
    const value = pose[f];
    if (value === undefined || value === null || Number.isNaN(value)) {
      throw new Error(`❌ Missing or invalid pose field: ${f}`);
    }
  }

  // Optional sanity checks (strongly recommended)
  if (typeof pose.x !== "number" || typeof pose.y !== "number") {
    throw new Error("❌ Pose x and y must be numbers");
  }

  if (
    typeof pose.timestamp !== "number" &&
    typeof pose.timestamp !== "string"
  ) {
    throw new Error("❌ Pose timestamp must be a number or ISO string");
  }

  return true;
}

/* ---------------------- LOGGING WHEN IN ZONE ---------------------- */
function onPositionInZone(pose, zone) {
  console.log("🚩 POSITION INSIDE ZONE DETECTED");
  console.log("Zone Code:", zone.code);
  console.log("Zone Title:", zone.title);
  console.log("Zone Description:", zone.description);
  console.log("Position:", {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    timestamp: pose.timestamp,
  });
  console.log("--------------------------------------");
}

/* ---------------------- SOCKET.IO CONNECTION ---------------------- */
const socket = io.connect(wsUri, {
  reconnection: true,
  reconnectionDelay: 10000,
  reconnectionAttempts: 10,
  transports: ["websocket", "polling"],
});

socket.on("connect", () => {
  console.log("✅ Connected to WebSocket");
  console.log("Socket ID:", socket.id);

  socket.emit("message", { start: ["Pose"] });
  console.log("Sent start message to device");
});

socket.on("message", async (data) => {
  console.log("Received pose data", data);

  try {
    if (data.pose) {
      const pose = data.pose;
      validatePose(pose);
      const normalizedPose = {
        ...pose,
        reference_frame: pose.reference_frame || "world",
        timestamp:
          typeof pose.timestamp === "number"
            ? new Date(pose.timestamp).toISOString()
            : pose.timestamp,
      };

      // Save full pose history
      await db.collection("all_positions").insertOne({ pose: normalizedPose });
      console.log("Saved to all_positions collection");

      // Upsert last known pose
      await db.collection("last_positions").updateOne(
        { slamCoreId: data.slamCoreId || "fake-device-002" }, // placeholder until device ID known
        {
          $set: { pose: normalizedPose, updatedAt: new Date() },
        },
        { upsert: true }
      );
      console.log("Updated last_positions collection");

      // ✅ Check if inside any zone
      const matchedZone = checkZones(normalizedPose);
      if (matchedZone) {
        console.log(`✅ Pose inside zone ${matchedZone.code}`);
      } else {
        console.log("❌ Pose outside all zones");
      }
    }
  } catch (error) {
    console.error("Error saving to MongoDB:", error);
  }
});

socket.on("connect_error", (error) => {
  console.error("Connection error:", error.message);
});

socket.on("disconnect", (reason) => {
  console.log("Disconnected from device:", reason);
  if (reason === "io server disconnect") socket.connect();
});

socket.on("reconnect", (attempt) => {
  console.log(`Reconnected after ${attempt} attempts`);
  socket.emit("message", { start: ["Pose"] });
});

/* ---------------------- STARTUP ---------------------- */
connectDB()
  .then(() => {
    console.log("System ready to receive pose data from device");
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB:", error);
    process.exit(1);
  });
