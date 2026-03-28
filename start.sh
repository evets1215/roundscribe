#!/bin/bash
# Roundscribe — start dev server + public tunnel
# Usage: ./start.sh
# Optional: set NGROK_DOMAIN=your-static-domain.ngrok-free.app in .env.local

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Kill any existing instances
pkill -f "next dev" 2>/dev/null
pkill -f "ngrok http" 2>/dev/null
sleep 1

echo "Starting Next.js..."
npm run dev > /tmp/roundscribe-next.log 2>&1 &
NEXT_PID=$!

echo "Waiting for Next.js to be ready..."
for i in {1..20}; do
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "Next.js ready."
    break
  fi
  sleep 1
done

# Use static domain if configured, otherwise random
DOMAIN=$(grep NGROK_DOMAIN .env.local 2>/dev/null | cut -d= -f2)
if [ -n "$DOMAIN" ]; then
  echo "Starting ngrok with static domain: $DOMAIN"
  ngrok http 3000 --domain="$DOMAIN" --log=stdout --log-format=json > /tmp/roundscribe-ngrok.log 2>&1 &
else
  echo "Starting ngrok (random URL)..."
  ngrok http 3000 --log=stdout --log-format=json > /tmp/roundscribe-ngrok.log 2>&1 &
fi
NGROK_PID=$!
sleep 4

URL=$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json; d=json.load(sys.stdin); t=d.get('tunnels',[]); print(t[0]['public_url'] if t else 'unavailable')" 2>/dev/null)
echo ""
echo "================================================"
echo "  Roundscribe is live!"
echo "  $URL"
echo "================================================"
echo ""
echo "Logs: /tmp/roundscribe-next.log  /tmp/roundscribe-ngrok.log"
echo "Press Ctrl+C to stop."

trap "kill $NEXT_PID $NGROK_PID 2>/dev/null; echo 'Stopped.'" INT TERM
wait
