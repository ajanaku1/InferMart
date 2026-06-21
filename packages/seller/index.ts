/**
 * Seller peer process: hosts QVAC inference, serves its dashboard, and reports earnings.
 *
 * Earnings truth = the seller's own USDT balance polled ON-CHAIN (never the buyer's word).
 * The buyer additionally POSTs a receipt per request so the dashboard can show token-level
 * detail; that's display only and is reconciled against the chain balance.
 */
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { loadDotenv } from "@infermart/shared/env";
import { createDashboardServer } from "@infermart/shared/dashboard-server";
import { settlementConfigFromEnv } from "@infermart/shared/wdk";
import type { SettlementReceipt } from "@infermart/shared/protocol";
import { startProvider } from "./inference.ts";
import { watchUsdtBalance } from "./settlement.ts";

await loadDotenv();
process.env.QVAC_CONFIG_PATH ??= join(process.cwd(), "qvac.config.js");
// Deterministic provider identity (stable public key across restarts) — seller only.
if (process.env.SELLER_QVAC_SEED) process.env.QVAC_HYPERSWARM_SEED = process.env.SELLER_QVAC_SEED;

const port = Number(process.env.SELLER_DASHBOARD_PORT ?? 4802);
const dash = createDashboardServer(port, join(import.meta.dirname, "web"));

let served = 0;
const receipts: SettlementReceipt[] = [];
dash.onPost("/receipt", (body) => {
  const r = body as SettlementReceipt;
  if (r.status === "settled") {
    served += 1;
    receipts.unshift(r);
    dash.broadcast("request", { receipt: r, served });
  }
  return { ok: true };
});

dash.start();
console.log("⛏️  InferMart seller starting...");
dash.broadcast("status", { phase: "seeding", chain: "sepolia", port });

const handle = await startProvider({
  allowedConsumerKey: process.env.ALLOWED_CONSUMER_KEY,
  onSeedProgress: (pct) => dash.broadcast("status", { phase: "seeding", percent: Math.round(pct) }),
});
console.log(`✅ provider live: ${handle.publicKey}`);
// Publish the key so the buyer process (and demo.sh) can pick it up out-of-band.
await mkdir(".spike", { recursive: true });
await writeFile(".spike/provider-key.txt", handle.publicKey, "utf8");
dash.broadcast("status", {
  phase: "live",
  providerPublicKey: handle.publicKey,
  walletAddress: process.env.SELLER_USDT_ADDRESS,
  relayKey: process.env.RELAY_PUBLIC_KEY,
});

// Real, on-chain earnings: poll the seller's USDT balance and report every move.
const cfg = settlementConfigFromEnv();
const sellerAddress = process.env.SELLER_USDT_ADDRESS;
if (sellerAddress) {
  watchUsdtBalance(sellerAddress, cfg, ({ balanceBaseUnits, deltaBaseUnits }) => {
    dash.broadcast("balance", {
      balanceBaseUnits: balanceBaseUnits.toString(),
      deltaBaseUnits: deltaBaseUnits.toString(),
    });
  });
}

process.on("SIGINT", () => {
  console.log("\n🛑 seller stopped");
  process.exit(0);
});
process.stdin.resume();
