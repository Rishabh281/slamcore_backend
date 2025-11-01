#!/bin/sh
set -e

echo "🔍 Checking external WebSocket availability..."
# Test connection (timeout 3s)
if nc -z -w3 94.112.79.114 80; then
  echo "✅ External WebSocket reachable. Using external server."
  export WS_URI="ws://94.112.79.114/v0/slam/ws/2b6b92fd31a6502d2bf1710efda04bc4225c4376c1"
else
  echo "⚠️ External WebSocket unreachable. Starting local fake server..."
  # Start fake server bound to all interfaces (so Node inside Docker can reach it)
  python3 /usr/src/app/temp/fake_server.py --host 0.0.0.0 --port 8765 &
  export WS_URI="ws://localhost:8765"
  sleep 3
fi

echo "🚀 Starting backend with WS_URI=$WS_URI"
exec npm start
