/**
 * Seller provider child process.
 *
 * Seeds the three hosted models and starts the QVAC provider with the firewall
 * allowlist passed in `ALLOWED_KEYS` (comma-separated Hyperswarm hex keys, empty
 * = locked). Prints its public key so the parent can parse it, then stays alive
 * serving delegated inference.
 *
 * Runs as a separate process because the QVAC firewall is fixed at swarm
 * creation and cannot change in-process — the parent respawns us with an
 * updated ALLOWED_KEYS whenever a new deposit is confirmed. Our public key is
 * stable across respawns (derived from QVAC_HYPERSWARM_SEED).
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { loadDotenv } from "@infermart/shared/env";
import { startProvider, HOSTED_MODELS } from "./inference.ts";

await loadDotenv();
process.env.QVAC_CONFIG_PATH ??= join(process.cwd(), "qvac.config.js");
if (process.env.SELLER_QVAC_SEED) process.env.QVAC_HYPERSWARM_SEED = process.env.SELLER_QVAC_SEED;

// The metering plugin lives in the custom worker bundle.
const customWorker = join(process.cwd(), "qvac", "worker.entry.mjs");
if (existsSync(customWorker)) process.env.QVAC_WORKER_PATH ??= customWorker;

const allowedKeys = (process.env.ALLOWED_KEYS ?? "").split(",").map((k) => k.trim()).filter(Boolean);
console.log(`provider-process: firewall ${allowedKeys.length > 0 ? `allow ${allowedKeys.length} key(s)` : "LOCKED"}`);

const handle = await startProvider({
  allowedKeys,
  onSeedProgress: (model, pct) => {
    if (Math.round(pct) % 25 === 0) console.log(`seed ${model} ${Math.round(pct)}%`);
  },
});

// Parsed by the parent (packages/seller/index.ts) — keep this exact format.
console.log(`Provider Public Key: ${handle.publicKey}`);

for (const m of HOSTED_MODELS) console.log(`hosting ${m.name} (${m.modality})`);

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
process.stdin.resume();
