const fs = require("fs");
const path = require("path");

async function ensureDatabaseSchema(db) {
  const requiredCollections = {
    bins: {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["binId", "updatedAt"],
          properties: {
            binId: { bsonType: "string" },
            load: { bsonType: "bool" },
            unload: { bsonType: "bool" },
            carriedBy: { bsonType: ["string", "null"] },
            position: {
              bsonType: ["object", "null"],
              properties: {
                x: { bsonType: "double" },
                y: { bsonType: "double" },
                z: { bsonType: "double" },
                timestamp: { bsonType: "string" },
              },
            },
            zoneCode: { bsonType: "string" },
            updatedAt: { bsonType: "date" },
            createdAt: { bsonType: "date" },
          },
        },
      },
    },

    bins_meta: {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["binId", "type"],
          properties: {
            binId: { bsonType: "string" },
            type: { bsonType: "string" },
            description: { bsonType: "string" },
            createdAt: { bsonType: "date" },
          },
        },
      },
    },

    last_positions: {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["slamCoreId", "pose"],
          properties: {
            slamCoreId: { bsonType: "string" },
            pose: {
              bsonType: "object",
              required: ["x", "y", "z", "timestamp"],
              properties: {
                x: { bsonType: "double" },
                y: { bsonType: "double" },
                z: { bsonType: "double" },
                timestamp: { bsonType: "string" },
              },
            },
            updatedAt: { bsonType: "date" },
          },
        },
      },
    },

    all_positions: {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["deviceId", "pose"],
          properties: {
            deviceId: { bsonType: "string" },
            pose: {
              bsonType: "object",
              required: ["x", "y", "z", "timestamp"],
              properties: {
                x: { bsonType: "double" },
                y: { bsonType: "double" },
                z: { bsonType: "double" },
                timestamp: { bsonType: "string" },
              },
            },
          },
        },
      },
    },

    bin_events: {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["binId", "event", "timestamp"],
          properties: {
            binId: { bsonType: "string" },
            event: { enum: ["load", "unload"] },
            forkliftId: { bsonType: "string" },
            zoneCode: { bsonType: "string" },
            position: { bsonType: ["object", "null"] },
            timestamp: { bsonType: "date" },
          },
        },
      },
    },

    zone_events: {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["deviceId", "from", "to", "timestamp"],
          properties: {
            deviceId: { bsonType: "string" },
            from: { bsonType: "string" },
            to: { bsonType: "string" },
            pose: { bsonType: ["object", "null"] },
            timestamp: { bsonType: "string" },
          },
        },
      },
    },

    zones: {
      validator: {
        $jsonSchema: {
          bsonType: "object",
          required: ["code", "boundary", "zmin", "zmax", "active"],
          properties: {
            code: { bsonType: "string" },
            title: { bsonType: ["string", "null"] },
            description: { bsonType: ["string", "null"] },
            boundary: { bsonType: "string" }, // WKT format
            zmin: { bsonType: ["double", "int"], description: "min Z height" },
            zmax: { bsonType: ["double", "int"], description: "max Z height" },
            active: { bsonType: "bool" },
          },
        },
      },
    },
  };

  const existingCollections = new Set(
    (await db.listCollections().toArray()).map((c) => c.name)
  );

  for (const [name, options] of Object.entries(requiredCollections)) {
    if (!existingCollections.has(name)) {
      await db.createCollection(name, options);
      console.log(`🆕 Created collection '${name}' with schema validation`);
    } else {
      // Update schema validation rules (if changed)
      await db
        .command({
          collMod: name,
          ...options,
        })
        .catch((err) => {
          if (err.codeName !== "NamespaceNotFound") {
            console.warn(
              `⚠️ Could not update validator for ${name}:`,
              err.message
            );
          }
        });
      console.log(`✅ Collection '${name}' already exists`);
    }
  }

  console.log("✅ All collections ensured and validated");
}

async function ensureZonesData(db) {
  try {
    const zonesCollection = db.collection("zones");
    const zonesFile = path.join(__dirname, "zones.json");

    if (!fs.existsSync(zonesFile)) {
      console.warn("⚠️ zones.json not found, skipping zone import.");
      return;
    }

    const zonesData = JSON.parse(fs.readFileSync(zonesFile, "utf8"));

    if (!Array.isArray(zonesData)) {
      console.error("❌ Invalid zones.json: expected an array.");
      return;
    }

    let upserted = 0;
    for (const zone of zonesData) {
      // Validation check
      if (!zone.code || !zone.boundary) {
        console.warn(`⚠️ Skipping invalid zone entry: ${JSON.stringify(zone)}`);
        continue;
      }

      const result = await zonesCollection.updateOne(
        { code: zone.code },
        { $set: zone },
        { upsert: true }
      );

      if (result.upsertedCount > 0) upserted++;
    }

    const total = zonesData.length;
    console.log(
      `✅ Zones sync complete. ${upserted} new or updated, total ${total} defined.`
    );
  } catch (err) {
    console.error("❌ Error ensuring zones data:", err);
  }
}

module.exports = { ensureDatabaseSchema, ensureZonesData };
