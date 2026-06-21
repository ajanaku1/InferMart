/**
 * Day-0 spike — SELLER side.
 * Pre-seeds the 1B-Q4 model (so this node truly hosts the weights), then opens a
 * QVAC delegated-inference provider over Holepunch and writes its public key to a
 * coordination file the consumer reads. Mirrors node_modules/@qvac/sdk delegated
 * provider + seed-p2p examples.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { startQVACProvider, downloadAsset, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

const KEY_FILE = ".spike/provider-key.txt";
const seed = process.env.QVAC_HYPERSWARM_SEED;
if (seed) process.env.QVAC_HYPERSWARM_SEED = seed;

console.log("⛏️  seller: downloading + seeding 1B-Q4 model (one-time)...");
let lastPct = -5;
await downloadAsset({
  assetSrc: LLAMA_3_2_1B_INST_Q4_0,
  seed: true,
  onProgress: (p: { percentage: number }) => {
    if (p.percentage - lastPct >= 5) {
      lastPct = p.percentage;
      console.log(`   model fetch ${p.percentage.toFixed(0)}%`);
    }
  },
});
console.log("✅ seller: model seeded locally.");

const { publicKey } = await startQVACProvider({
  firewall: process.env.ALLOWED_CONSUMER_KEY
    ? { mode: "allow", publicKeys: [process.env.ALLOWED_CONSUMER_KEY] }
    : undefined,
});

await mkdir(dirname(KEY_FILE), { recursive: true });
await writeFile(KEY_FILE, publicKey, "utf8");
console.log(`✅ seller: provider live.\n   🆔 ${publicKey}\n   (written to ${KEY_FILE})`);
console.log("📡 serving delegated inference... Ctrl+C to stop");

process.on("SIGINT", () => {
  console.log("\n🛑 seller stopped");
  process.exit(0);
});
process.stdin.resume();
