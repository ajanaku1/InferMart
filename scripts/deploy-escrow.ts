/**
 * Compile + deploy InferMartEscrow to Sepolia and save ESCROW_CONTRACT to .env.
 *
 * Needs the buyer funded with a little Sepolia ETH for gas (run fund-wallets first).
 * Run: node scripts/deploy-escrow.ts   (or: npm run deploy-escrow)
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

async function saveEnvVar(key: string, value: string): Promise<void> {
  const path = join(ROOT, ".env");
  let text = await readFile(path, "utf8").catch(() => "");
  const line = `${key}=${value}`;
  text = new RegExp(`^${key}=.*$`, "m").test(text)
    ? text.replace(new RegExp(`^${key}=.*$`, "m"), line)
    : text + `\n${line}\n`;
  await writeFile(path, text, "utf8");
}

interface Compiled {
  abi: ethers.InterfaceAbi;
  bytecode: string;
}

export function compileEscrow(source: string): Compiled {
  const input = {
    language: "Solidity",
    sources: { "InferMartEscrow.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (out.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (errors.length) throw new Error(errors.map((e: { formattedMessage: string }) => e.formattedMessage).join("\n"));
  const c = out.contracts["InferMartEscrow.sol"].InferMartEscrow;
  return { abi: c.abi, bytecode: c.evm.bytecode.object };
}

const env = await loadEnv();
const source = await readFile(join(ROOT, "contracts/InferMartEscrow.sol"), "utf8");
const { abi, bytecode } = compileEscrow(source);
console.log("✅ compiled InferMartEscrow");

if (process.argv.includes("--compile-only")) {
  console.log("compile-only: skipping deploy.");
  process.exit(0);
}

const rpc = process.env.RPC_URL || env.get("RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com";
const mnemonic = env.get("BUYER_WALLET_MNEMONIC");
if (!mnemonic) throw new Error("BUYER_WALLET_MNEMONIC missing — run `node scripts/fund-wallets.ts` first");

const provider = new ethers.JsonRpcProvider(rpc);
const wallet = ethers.Wallet.fromPhrase(mnemonic, provider);
console.log(`deployer/buyer: ${wallet.address}`);

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
// Tight fee caps: the demo wallets run on faucet dust, so don't let ethers
// reserve gas at double the base fee. Override with GAS_MAX_FEE_GWEI if stuck.
const block = await provider.getBlock("latest");
const baseFee = block?.baseFeePerGas ?? ethers.parseUnits("1", "gwei");
const maxFeePerGas = process.env.GAS_MAX_FEE_GWEI
  ? ethers.parseUnits(process.env.GAS_MAX_FEE_GWEI, "gwei")
  : (baseFee * 115n) / 100n;
const escrow = await factory.deploy({ maxFeePerGas, maxPriorityFeePerGas: ethers.parseUnits("0.05", "gwei") });
await escrow.waitForDeployment();
const address = await escrow.getAddress();

await saveEnvVar("ESCROW_CONTRACT", address);
console.log(`✅ InferMartEscrow deployed: ${address}`);
console.log(`✅ wrote ESCROW_CONTRACT to .env`);
console.log(`   explorer: https://sepolia.etherscan.io/address/${address}`);
