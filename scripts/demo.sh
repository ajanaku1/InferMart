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

echo "① relay..."
node packages/relay/relay.ts > "$LOG/relay.log" 2>&1 & pids+=($!)
until [ -s .spike/relay-key.txt ]; do sleep 1; done
echo "   relay $(cat .spike/relay-key.txt | cut -c1-12)…"

echo "② seller (loads model, opens P2P endpoint)..."
node packages/seller/index.ts > "$LOG/seller.log" 2>&1 & pids+=($!)
until [ -s .spike/provider-key.txt ]; do sleep 2; done
echo "   provider $(cat .spike/provider-key.txt | cut -c1-12)… · dashboard http://localhost:4802"

echo "③ buyer (connects over Holepunch; first connect cold-boots the DHT, ~20s)..."
node packages/buyer/index.ts > "$LOG/buyer.log" 2>&1 & pids+=($!)
until grep -q "connected to provider" "$LOG/buyer.log" 2>/dev/null; do sleep 2; done
echo "   buyer dashboard http://localhost:4801"

command -v open >/dev/null && open http://localhost:4802 http://localhost:4801 || true
echo
echo "✅ InferMart live. Seller :4802 · Buyer :4801"
echo "   Type a prompt in the buyer dashboard; watch USDT settle on both sides."
echo "   Ctrl+C to stop. (logs in .spike/*.log)"
wait
