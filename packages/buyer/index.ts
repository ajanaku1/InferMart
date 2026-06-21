/**
 * Buyer peer process: serves its dashboard, sends prompts over P2P to the seller's
 * QVAC provider, meters the result, and settles in real USDT — never charging on a
 * failed or over-cap request. Each settled request is reported to the seller.
 */
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { loadDotenv } from "@infermart/shared/env";
import { createDashboardServer } from "@infermart/shared/dashboard-server";
import { settlementConfigFromEnv } from "@infermart/shared/wdk";
import type { Message } from "@infermart/shared/protocol";
import { connectToProvider } from "./client.ts";
import { createSettler } from "./wallet.ts";

await loadDotenv();
process.env.QVAC_CONFIG_PATH ??= join(process.cwd(), "qvac.config.js");
// The buyer must NOT share the seller's provider identity, or holepunch self-connects
// and fails. Force a fresh random consumer identity every boot.
delete process.env.QVAC_HYPERSWARM_SEED;

const port = Number(process.env.BUYER_DASHBOARD_PORT ?? 4801);
const dash = createDashboardServer(port, join(import.meta.dirname, "web"));
dash.start();

const sessionCap = Number(process.env.SESSION_SPEND_CAP_BASEUNITS ?? 1_000_000);
const pricePer1k = Number(process.env.PRICE_PER_1K_TOKENS_BASEUNITS ?? 1000);
const sellerReceiptUrl = process.env.SELLER_RECEIPT_URL ?? "http://localhost:4802/receipt";

async function providerKey(): Promise<string> {
  return (process.env.SELLER_PROVIDER_PUBLIC_KEY || (await readFile(".spike/provider-key.txt", "utf8"))).trim();
}

console.log("🛒 InferMart buyer starting...");
dash.broadcast("status", { phase: "connecting", port, capBaseUnits: sessionCap, pricePer1k });

const cfg = settlementConfigFromEnv();
const settler = await createSettler(process.env.BUYER_WALLET_MNEMONIC!, cfg, {
  pricePer1kBaseUnits: pricePer1k,
  sessionCapBaseUnits: sessionCap,
  sellerUsdtAddress: process.env.SELLER_USDT_ADDRESS!,
});
const client = await connectToProvider(await providerKey());
console.log(`✅ connected to provider; model ${client.modelId}`);
dash.broadcast("status", { phase: "ready", buyerAddress: settler.address, capBaseUnits: sessionCap, pricePer1k });

function emitSpend(): void {
  dash.broadcast("spend", { spentBaseUnits: settler.spentBaseUnits, capBaseUnits: sessionCap });
}
emitSpend();

dash.onPost("/ask", async (body) => {
  const prompt = String((body as { prompt?: string }).prompt ?? "").trim();
  if (!prompt) return { error: "empty prompt" };
  const requestId = randomUUID();
  const history: Message[] = [{ role: "user", content: prompt }];

  dash.broadcast("request", { requestId, prompt });
  const stats = await client.run(history, (token) => dash.broadcast("chunk", { requestId, token }));
  dash.broadcast("done", { requestId, stats });

  const receipt = await settler.settle(requestId, stats);
  dash.broadcast("receipt", receipt);
  emitSpend();
  if (receipt.status === "settled") void notifySeller(receipt);
  return { requestId, status: receipt.status };
});

async function notifySeller(receipt: unknown): Promise<void> {
  try {
    await fetch(sellerReceiptUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(receipt),
    });
  } catch {
    // demo convenience channel — seller's earnings are confirmed on-chain regardless
  }
}

process.on("SIGINT", () => {
  console.log("\n🛑 buyer stopped");
  settler.dispose();
  process.exit(0);
});
process.stdin.resume();
