# Reproducing the InferMart demo

## Hardware

The whole demo runs on one machine. The seller, the buyer, and the relay are separate
local processes on the same laptop, connected over localhost and a Hyperswarm blind relay.

| | |
|---|---|
| Device | MacBook Pro 13" (2019), macOS 15.7 |
| CPU | Intel Core i5-8257U, 4 cores / 8 threads @ 1.4 GHz |
| GPU | Intel Iris Plus Graphics 645 (integrated, 1.5 GB shared); no discrete GPU, so inference runs on CPU |
| RAM | 16 GB |
| Storage | 233 GB SSD (the three models are ~900 MB on disk combined) |
| Runtime | Node.js 22+ (tested on 25.6.1) |
| Extra | `ffmpeg` on PATH (decodes recorded/sample audio to raw PCM for Whisper) |

The blind relay is what lets two peers behind the same network reach each other. On two
physical devices on different networks it isn't needed, and they connect directly.

## Steps

```bash
git clone https://github.com/ajanaku1/InferMart
cd InferMart
npm install --registry=https://registry.npmjs.org   # QVAC/WDK live on the official registry

# 1. create the buyer + seller wallets (secrets go to a gitignored .env)
npm run fund-wallets
#    fund the printed BUYER address with a little Sepolia ETH for gas:
#    https://faucet.quicknode.com/ethereum/sepolia

# 2. deploy the test USDT and mint 1,000,000 to the buyer
npm run deploy-usdt

# 3. (optional) prove one real on-chain settlement end to end
npm run verify-settlement

# 4. bundle the metering worker, launch relay + seller + buyer, open both dashboards
npm run demo
```

Open `http://localhost:4801` (buyer). On first run the buyer signs an access claim, deposits
USDT, and waits for the seller's firewall to open. That takes a minute or two for the
deposit to confirm on Sepolia. Once the dashboards are live, hit **Use sample note** to run
the voice pipeline (or record your own), and watch each of the three legs settle in USDT on
both sides. The seller dashboard is `http://localhost:4802`.

## Notes

- First delegated call cold-boots the DHT in about 20 seconds; later calls are sub-second.
- The three models (Llama-3.2-1B Q4, Whisper-tiny, Supertonic-q8) download once from the QVAC
  registry on first run.
- `npm run demo` runs `npm run bundle-worker` first so the seller's metering plugin is bundled
  into the provider worker. If you start the seller by hand, run `npm run bundle-worker` once.
- This machine has no usable GPU, so models load with `device:"cpu"`. That is already wired in.
- The firewall is fixed when the QVAC swarm is created, so the seller runs the provider in a
  child process and respawns it with an updated allowlist when a deposit confirms. The provider
  public key is stable across respawns. Details in `docs/spike-findings.md`.
- To run a true two-device demo, set the buyer's `SELLER_PROVIDER_PUBLIC_KEY` and
  `SELLER_USDT_ADDRESS` from the seller's output, and skip the relay.
