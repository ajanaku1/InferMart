#!/usr/bin/env bash
# InferMart — zero-to-demo in one command:  npm run quickstart
# Creates wallets if needed, waits for faucet gas, deploys the test USDT,
# proves one on-chain settlement, then launches the full two-peer demo.
# Safe to re-run: every step is skipped once its end state exists.
set -euo pipefail
cd "$(dirname "$0")/.."

step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

step "① prerequisites"
if ! command -v node >/dev/null; then echo "✗ node not found (need Node 22+)"; exit 1; fi
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 22 ]; then echo "✗ Node $NODE_MAJOR too old (need 22+ for TypeScript type-stripping)"; exit 1; fi
command -v ffmpeg >/dev/null || echo "⚠ ffmpeg not on PATH — voice recording will not decode (sample note still works after install: brew install ffmpeg)"
[ -d node_modules ] || { echo "  installing dependencies..."; npm install --registry=https://registry.npmjs.org; }
echo "  node $(node -v) ok"

step "② wallets"
if ! grep -q '^BUYER_WALLET_MNEMONIC=..*' .env 2>/dev/null; then
  node scripts/fund-wallets.ts
else
  echo "  wallets already in .env"
fi

BUYER_ADDR=$(node -e "
  const { readFileSync } = require('node:fs');
  const m = readFileSync('.env','utf8').match(/^BUYER_WALLET_MNEMONIC=(.+)$/m)[1];
  const { ethers } = require('ethers');
  console.log(ethers.Wallet.fromPhrase(m).address);
")
RPC_URL=$(grep -oE '^RPC_URL=.+' .env 2>/dev/null | cut -d= -f2- || true)
RPC_URL=${RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}

step "③ gas (Sepolia ETH for the buyer)"
gas_wei() { node -e "
  const { ethers } = require('ethers');
  new ethers.JsonRpcProvider('$RPC_URL').getBalance('$BUYER_ADDR').then(b => console.log(b.toString())).catch(() => console.log('0'));
"; }
if [ "$(gas_wei)" = "0" ]; then
  echo "  buyer needs a little Sepolia ETH for gas."
  echo "  address:  $BUYER_ADDR"
  echo "  faucet:   https://faucet.quicknode.com/ethereum/sepolia"
  echo "  waiting for the faucet transfer to land (checks every 15s, Ctrl+C to abort)..."
  until [ "$(gas_wei)" != "0" ]; do sleep 15; printf '.'; done
  echo
fi
echo "  gas ok ($BUYER_ADDR)"

step "④ test USDT"
if ! grep -q '^USDT_CONTRACT=0x' .env 2>/dev/null; then
  node scripts/deploy-usdt.ts
else
  echo "  USDT_CONTRACT already in .env"
fi

if [ "${1:-}" != "--fast" ]; then
  step "⑤ prove one real on-chain settlement"
  node scripts/verify-settlement.ts
else
  step "⑤ settlement proof skipped (--fast)"
fi

step "⑥ launch the marketplace"
exec bash scripts/demo.sh
