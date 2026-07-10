#!/usr/bin/env bash
# InferMart — one-command two-peer launch for the demo.
# Starts: blind relay → seller (hosts model, serves :4802) → buyer (:4801).
# Opens both dashboards. Ctrl+C tears everything down.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "✗ No .env. Run:  npm run fund-wallets  then fund the buyer + npm run deploy-usdt"
  exit 1
fi

mkdir -p .spike
LOG=.spike
pids=()
cleanup(){ echo; echo "🛑 stopping InferMart..."; for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done
  pkill -f "qvac-worker" 2>/dev/null || true; rm -f "$HOME/.qvac/.worker.lock" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

pkill -f "qvac-worker" 2>/dev/null || true; rm -f "$HOME/.qvac/.worker.lock" 2>/dev/null || true
rm -f .spike/provider-key.txt

echo "① worker bundle (metering plugin → provider runtime)..."
if [ ! -f qvac/worker.entry.mjs ]; then
  npm run bundle-worker > "$LOG/bundle.log" 2>&1 || { echo "✗ worker bundle failed (see $LOG/bundle.log)"; exit 1; }
fi
echo "   qvac/worker.entry.mjs ready"

echo "② relay..."
node packages/relay/relay.ts > "$LOG/relay.log" 2>&1 & pids+=($!)
until [ -s .spike/relay-key.txt ]; do sleep 1; done
echo "   relay $(cat .spike/relay-key.txt | cut -c1-12)…"

echo "③ seller (seeds Llama+Whisper+TTS, opens deposit-gated P2P endpoint)..."
node packages/seller/index.ts > "$LOG/seller.log" 2>&1 & pids+=($!)
until [ -s .spike/provider-key.txt ]; do sleep 2; done
echo "   provider $(cat .spike/provider-key.txt | cut -c1-12)… (firewall LOCKED) · dashboard http://localhost:4802"

echo "④ buyer (signs access claim, deposits USDT, waits for the firewall to open, then connects)..."
node packages/buyer/index.ts > "$LOG/buyer.log" 2>&1 & pids+=($!)
until grep -q "voice models ready" "$LOG/buyer.log" 2>/dev/null; do
  grep -q "firewall never opened" "$LOG/buyer.log" 2>/dev/null && { echo "✗ deposit sent but firewall never opened (see $LOG/buyer.log)"; exit 1; }
  sleep 3
done
echo "   buyer admitted after on-chain deposit · dashboard http://localhost:4801"

command -v open >/dev/null && open http://localhost:4802 http://localhost:4801 || true
echo
echo "✅ InferMart live. Seller :4802 · Buyer :4801"
echo "   In the buyer dashboard: hit 'Use sample note' to run the voice pipeline"
echo "   (Whisper → Llama → Supertonic), or record your own. Each leg settles in"
echo "   USDT with a provider-signed receipt — watch both dashboards."
echo "   Ctrl+C to stop. (logs in .spike/*.log)"
wait
