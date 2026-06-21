/**
 * Compile + deploy MockUSDT to Sepolia, mint test USDT to the buyer, save USDT_CONTRACT.
 *
 * Needs the buyer funded with a little Sepolia ETH for gas (run fund-wallets first).
 * Uses ethers directly for deployment (WDK transfers; ethers does contract creation).
 * The buyer mnemonic derives the SAME address in ethers and WDK (BIP-44 m/44'/60'/0'/0/0).
 *
 * Run: node scripts/deploy-usdt.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import { ethers } from "ethers";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnv(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const text = await readFile(join(ROOT, ".env"), "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

async function saveUsdtContract(address: string): Promise<void> {
  const path = join(ROOT, ".env");
  let text = await readFile(path, "utf8").catch(() => "");
  text = /^USDT_CONTRACT=.*$/m.test(text)
    ? text.replace(/^USDT_CONTRACT=.*$/m, `USDT_CONTRACT=${address}`)
    : text + `\nUSDT_CONTRACT=${address}\n`;
  await writeFile(path, text, "utf8");
}

function compileMockUsdt(source: string): { abi: unknown[]; bytecode: string } {
  const input = {
    language: "Solidity",
    sources: { "MockUSDT.sol": { content: source } },
    settings: { outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n"));
  const c = out.contracts["MockUSDT.sol"].MockUSDT;
  return { abi: c.abi, bytecode: c.evm.bytecode.object };
}

const env = await loadEnv();
const source = await readFile(join(ROOT, "contracts/MockUSDT.sol"), "utf8");
const { abi, bytecode } = compileMockUsdt(source);
console.log("✅ compiled MockUSDT");

if (process.argv.includes("--compile-only")) {
  console.log("compile-only: skipping deploy.");
  process.exit(0);
}

const rpc = env.get("RPC_URL") ?? "https://ethereum-sepolia-rpc.publicnode.com";
const mnemonic = env.get("BUYER_WALLET_MNEMONIC");
if (!mnemonic) throw new Error("BUYER_WALLET_MNEMONIC missing — run `node scripts/fund-wallets.ts` first");

const provider = new ethers.JsonRpcProvider(rpc);
const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
console.log(`deployer/buyer: ${wallet.address}`);

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const usdt = await factory.deploy();
await usdt.waitForDeployment();
const address = await usdt.getAddress();
console.log(`✅ MockUSDT deployed: ${address}`);

const amount = 1_000_000n * 1_000_000n; // 1,000,000 USDT (6 decimals) for a generous demo float
const mintTx = await (usdt as ethers.Contract).mint(wallet.address, amount);
await mintTx.wait();
console.log(`✅ minted 1,000,000 test USDT to buyer (${mintTx.hash})`);

await saveUsdtContract(address);
console.log(`✅ wrote USDT_CONTRACT=${address} to .env`);
console.log(`   explorer: https://sepolia.etherscan.io/address/${address}`);
