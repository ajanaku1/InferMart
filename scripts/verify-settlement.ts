/**
 * web3-testing: prove a REAL testnet USDT transfer lands end-to-end via WDK.
 *
 * Reads .env, checks the buyer's USDT balance, sends a tiny transfer to the seller
 * through the exact code path the buyer process uses (createSettler), waits for the
 * receipt, and confirms the seller's on-chain balance moved. Prints the tx hash +
 * explorer link. This is the credibility pillar — run it before recording.
 *
 * Run: node scripts/verify-settlement.ts
 */
import { readFile } from "node:fs/promises";
import { settlementConfigFromEnv, signingAccount, readOnlyAccount, usdtBalanceBaseUnits } from "@infermart/shared/wdk";
import { createSettler } from "../packages/buyer/wallet.ts";

async function loadDotenv(): Promise<void> {
  const text = await readFile(".env", "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

await loadDotenv();
const cfg = settlementConfigFromEnv();
const buyerMnemonic = process.env.BUYER_WALLET_MNEMONIC;
const sellerAddress = process.env.SELLER_USDT_ADDRESS;
if (!buyerMnemonic || !sellerAddress) throw new Error("Run `npm run fund-wallets` first (need BUYER_WALLET_MNEMONIC + SELLER_USDT_ADDRESS).");

const buyerAcct = await signingAccount(buyerMnemonic, cfg);
const buyerBal = await usdtBalanceBaseUnits(buyerAcct, cfg);
console.log(`buyer USDT balance: ${Number(buyerBal) / 1e6} USDT`);
if (buyerBal === 0n) throw new Error("Buyer has 0 USDT — run `npm run deploy-usdt` (or fund via faucet) first.");

const sellerBefore = await usdtBalanceBaseUnits(readOnlyAccount(sellerAddress, cfg), cfg);

// Settle a synthetic "request" of 1000 generated tokens through the real buyer path.
const settler = await createSettler(buyerMnemonic, cfg, {
  pricePer1kBaseUnits: Number(process.env.PRICE_PER_1K_TOKENS_BASEUNITS ?? 1000),
  sessionCapBaseUnits: Number(process.env.SESSION_SPEND_CAP_BASEUNITS ?? 1_000_000),
  sellerUsdtAddress: sellerAddress,
});
console.log("sending real USDT settlement for a 1000-token request...");
const receipt = await settler.settle("verify-" + buyerBal.toString(), { generatedTokens: 1000, promptTokens: 50 });

if (receipt.status !== "settled") throw new Error(`settlement ${receipt.status}: ${receipt.reason}`);
console.log(`✅ tx submitted: ${receipt.txHash}`);
console.log(`   ${receipt.explorerUrl}`);

// WDK returns the hash before the tx is mined; poll the seller's on-chain balance
// until it reflects the transfer (or time out), exactly as the seller dashboard does.
const sellerView = readOnlyAccount(sellerAddress, cfg);
console.log("waiting for the seller's on-chain balance to move...");
let sellerAfter = sellerBefore;
for (let i = 0; i < 30 && sellerAfter === sellerBefore; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  sellerAfter = await usdtBalanceBaseUnits(sellerView, cfg);
}
const moved = sellerAfter - sellerBefore;
console.log(`seller balance moved: +${Number(moved) / 1e6} USDT (expected +${receipt.amountBaseUnits / 1e6})`);
if (moved !== BigInt(receipt.amountBaseUnits)) throw new Error("on-chain delta != settled amount");
console.log("\n🎯 Real testnet USDT settlement verified end-to-end.");
settler.dispose();
