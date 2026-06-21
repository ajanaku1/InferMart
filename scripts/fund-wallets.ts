/**
 * Generate the demo wallets and print funding steps.
 *
 * - Creates a buyer + seller BIP-39 mnemonic IF they aren't already in .env.
 * - Derives each EVM address via WDK and records SELLER_USDT_ADDRESS.
 * - Persists secrets ONLY to .env (gitignored). Never prints a mnemonic.
 * - Prints the two addresses + exactly what to fund via faucet.
 *
 * Run: node scripts/fund-wallets.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import bip39 from "bip39";
import WalletManagerEvm from "@tetherto/wdk-wallet-evm";

const ENV_PATH = ".env";
const RPC = process.env.RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

async function readEnv(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const text = await readFile(ENV_PATH, "utf8");
    for (const line of text.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) map.set(m[1], m[2]);
    }
  } catch {
    // no .env yet
  }
  return map;
}

async function writeEnv(map: Map<string, string>): Promise<void> {
  const body = [...map].map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  await writeFile(ENV_PATH, body, "utf8");
}

async function deriveAddress(mnemonic: string): Promise<string> {
  const wallet = new WalletManagerEvm(mnemonic, { provider: RPC, chainId: 11155111 });
  const account = await wallet.getAccount(0);
  const address = account.address;
  wallet.dispose?.();
  return address;
}

const env = await readEnv();
if (!env.has("RPC_URL")) env.set("RPC_URL", RPC);

if (!env.get("BUYER_WALLET_MNEMONIC")) env.set("BUYER_WALLET_MNEMONIC", bip39.generateMnemonic());
if (!env.get("SELLER_WALLET_MNEMONIC")) env.set("SELLER_WALLET_MNEMONIC", bip39.generateMnemonic());

const buyerAddress = await deriveAddress(env.get("BUYER_WALLET_MNEMONIC")!);
const sellerAddress = await deriveAddress(env.get("SELLER_WALLET_MNEMONIC")!);
env.set("SELLER_USDT_ADDRESS", sellerAddress);

await writeEnv(env);

console.log("\n🔑 InferMart demo wallets (secrets saved to .env, gitignored)\n");
console.log(`  BUYER  (pays):     ${buyerAddress}`);
console.log(`  SELLER (receives): ${sellerAddress}\n`);
console.log("Fund the BUYER, then deploy/mint test USDT:");
console.log("  1. Sepolia ETH (gas) → BUYER:  https://sepoliafaucet.com  or  https://faucet.quicknode.com/ethereum/sepolia");
console.log("  2. Test USDT → BUYER: set USDT_CONTRACT in .env to a faucet token, OR run  npm run deploy-usdt");
console.log("  3. Verify:  npm run verify-settlement\n");
