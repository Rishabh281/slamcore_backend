# fake_server.py
import asyncio
import json
import random
import time
from datetime import datetime, timezone
import websockets

HOST = "0.0.0.0"
PORT = 8765
EMIT_INTERVAL_SECONDS = 0.5

ZONES = {
    "WEIGHING-ZONE": (374, 377, 75, 78),
    "SLITTER-11-HOPPER-LEFT-ZONE": (397, 398, 58, 59),
    "SLITTER-11-HOPPER-RIGHT-ZONE": (397, 398, 60, 61),
    "SLITTER-9-10-SCRAP-STORAGE": (376, 381, 84, 99),
    "SCRAP-UNWINDER": (374, 384, 147, 167),
    "SLITTER-8-12-N-SCRAP-STORAGE": (397, 407, 139, 162),
    "SLITTER-8-12-S-SCRAP-STORAGE": (397, 412, 3, 41),
    "SLITTER-11-SCRAP-STORAGE": (381, 395, 46, 70),
    "SLITTER-10-SCRAP-STORAGE": (386, 395, 75, 120),
    "BLANKING": (424, 472, 32, 80),
}

def make_pose(in_zone=False, zone_index=None, seed=None):
    if seed is not None:
        random.seed(seed)

    if in_zone:
        zone_name = list(ZONES.keys())[zone_index % len(ZONES)]
        xmin, xmax, ymin, ymax = ZONES[zone_name]
        x = random.uniform(xmin, xmax)
        y = random.uniform(ymin, ymax)
    else:
        # generate random pose outside zones
        for _ in range(50):
            x = random.uniform(300, 500)
            y = random.uniform(0, 200)
            inside = any(xmin <= x <= xmax and ymin <= y <= ymax for (xmin, xmax, ymin, ymax) in ZONES.values())
            if not inside:
                break

    z = random.uniform(0.0, 2.0)
    qx, qy, qz, qw = [random.uniform(-1, 1) for _ in range(4)]
    timestamp = datetime.now(timezone.utc).isoformat()

    return {
        "slamCoreId": "forklift-001",
        "pose": {
            "x": x,
            "y": y,
            "z": z,
            "qx": qx,
            "qy": qy,
            "qz": qz,
            "qw": qw,
            "reference_frame": "world",
            "timestamp": timestamp,
        },
    }

# Works for both old/new websockets versions
async def client_handler(websocket, path=None):
    print(f"🟢 Node client connected: {websocket.remote_address}")

    counter = 0
    zone_cycle = 0

    try:
        while True:
            in_zone = counter % 10 == 0
            data = make_pose(in_zone=in_zone, zone_index=zone_cycle, seed=time.time() + counter)

            if in_zone:
                zone_name = list(ZONES.keys())[zone_cycle % len(ZONES)]
                print(f"📍 Sending pose INSIDE {zone_name}")
                zone_cycle += 1
            else:
                print("🌍 Sending random pose OUTSIDE all zones")

            await websocket.send(json.dumps(data))
            counter += 1
            await asyncio.sleep(EMIT_INTERVAL_SECONDS)
    except websockets.ConnectionClosed:
        print(f"🔴 Node client disconnected: {websocket.remote_address}")

async def main():
    print(f"🚀 Fake WebSocket server running at ws://{HOST}:{PORT}")
    async with websockets.serve(client_handler, HOST, PORT):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🛑 Server stopped manually")
