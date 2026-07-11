/**
 * Prove the receipt-anchored escrow end to end on Sepolia, with real transactions:
 *
 *   1. buyer approves + opens (or tops up) a channel with the seller
 *   2. a provider identity signs a usage receipt (ed25519, same scheme as the live pipeline)
 *   3. the buyer verifies that receipt, then signs an EIP-712 voucher anchored to its hash
 *   4. the buyer RELAYS the claim (permissionless; payout only ever goes to the seller)
 *   5. the seller's on-chain USDT balance is checked to have moved by exactly the voucher delta
 *
 * The receipt here is signed in-script by a fresh provider identity so the proof is
 * self-contained; in the live marketplace the same bytes come from the seller's
 * metering plugin. Run: npm run verify-escrow
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { ethers } from "ethers";
import DHT from "hyperdht";
import { signReceipt, verifyReceipt, type UsageReceipt } from "../packages/shared/receipts.ts";
import { channelIdOf, receiptHashOf, signVoucher, recoverVoucherSigner, computeClaimDelta } from "../packages/shared/escrow-voucher.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const ESCROW_ABI = [
  "function channels(bytes32) view returns (address buyer, address seller, address token, uint256 deposited, uint256 claimed, uint64 epoch, uint64 closeAt)",
  "function open(address seller, address token, uint256 amount)",
  "function claim(bytes32 id, uint64 epoch, uint256 cumulativeAmount, bytes32 receiptHash, uint8 v, bytes32 r, bytes32 s)",
];
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
];

async function loadEnv(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const text = await readFile(join(ROOT, ".env"), "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

function need(env: Map<string, string>, key: string): string {
  const v = env.get(key);
  if (!v) throw new Error(`${key} missing from .env (run quickstart, then npm run deploy-escrow)`);
  return v;
}

function makeSignedReceipt(providerKeys: { publicKey: Buffer; secretKey: Buffer }) {
  const receipt: UsageReceipt = {
    v: 1,
    requestId: randomUUID(),
    modality: "llm",
    modelId: "llama-3.2-1b",
    units: 45,
    unitKind: "tokens",
    provider: providerKeys.publicKey.toString("hex"),
    issuedAt: Date.now(),
  };
  return signReceipt(receipt, providerKeys.secretKey);
}

async function feeOverrides(p: ethers.JsonRpcProvider): Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  const block = await p.getBlock("latest");
  const baseFee = block?.baseFeePerGas ?? ethers.parseUnits("1", "gwei");
  return { maxFeePerGas: (baseFee * 115n) / 100n, maxPriorityFeePerGas: ethers.parseUnits("0.05", "gwei") };
}

const env = await loadEnv();
const rpc = process.env.RPC_URL || env.get("RPC_URL") || "https://ethereum-sepolia-rpc.publicnode.com";
const provider = new ethers.JsonRpcProvider(rpc);
const buyer = ethers.Wallet.fromPhrase(need(env, "BUYER_WALLET_MNEMONIC"), provider);
const sellerAddr = need(env, "SELLER_USDT_ADDRESS");
const usdtAddr = need(env, "USDT_CONTRACT");
const escrowAddr = need(env, "ESCROW_CONTRACT");
const { chainId } = await provider.getNetwork();

const usdt = new ethers.Contract(usdtAddr, ERC20_ABI, buyer);
const escrow = new ethers.Contract(escrowAddr, ESCROW_ABI, buyer);
const id = channelIdOf(buyer.address, sellerAddr, usdtAddr);

console.log(`buyer   ${buyer.address}`);
console.log(`seller  ${sellerAddr}`);
console.log(`escrow  ${escrowAddr} (chain ${chainId})`);

// ── 1. provider signs a receipt; buyer verifies it before touching money ──
const providerKeys = DHT.keyPair();
const signed = makeSignedReceipt(providerKeys);
if (!verifyReceipt(signed, signed.provider)) throw new Error("receipt failed verification — refusing to pay");
const receiptHash = receiptHashOf(signed);
console.log(`✅ provider-signed receipt verified (${signed.units} ${signed.unitKind}) · anchor ${receiptHash.slice(0, 18)}…`);

// ── 2. read channel state; top up so the new voucher is claimable ──
const before = await escrow.channels(id);
const priceBaseUnits = 45n; // 45 tokens at the demo LLM rate of 0.000001 USDT per token
const cumulative = before.claimed + priceBaseUnits;
const needDeposit = cumulative > before.deposited ? cumulative - before.deposited : 0n;

if (needDeposit > 0n) {
  const topUp = needDeposit < 10_000n ? 10_000n : needDeposit; // deposit at least 0.01 USDT so the channel has float
  const approveTx = await usdt.approve(escrowAddr, topUp, await feeOverrides(provider));
  await approveTx.wait();
  const openTx = await escrow.open(sellerAddr, usdtAddr, topUp, await feeOverrides(provider));
  await openTx.wait();
  console.log(`✅ channel funded with ${ethers.formatUnits(topUp, 6)} USDT (${openTx.hash})`);
} else {
  console.log(`✅ channel already funded (deposited ${ethers.formatUnits(before.deposited, 6)} USDT)`);
}

// ── 3. buyer signs the receipt-anchored voucher (only after the mirror math passes) ──
const state = await escrow.channels(id);
const delta = computeClaimDelta(state.claimed, state.deposited, cumulative);
const fields = { channelId: id, epoch: state.epoch, cumulativeAmount: cumulative, receiptHash };
const domain = { chainId, verifyingContract: escrowAddr };
const sig = await signVoucher(buyer, domain, fields);
if (recoverVoucherSigner(domain, fields, sig) !== buyer.address) throw new Error("voucher self-check failed");
console.log(`✅ voucher signed: cumulative ${ethers.formatUnits(cumulative, 6)} USDT, epoch ${state.epoch}`);

// ── 4. relay the claim and prove the payout landed ──
const sellerBefore: bigint = await usdt.balanceOf(sellerAddr);
const claimTx = await escrow.claim(id, state.epoch, cumulative, receiptHash, sig.v, sig.r, sig.s, await feeOverrides(provider));
const rcpt = await claimTx.wait();
const sellerAfter: bigint = await usdt.balanceOf(sellerAddr);

if (sellerAfter - sellerBefore !== delta) {
  throw new Error(`payout mismatch: seller moved ${sellerAfter - sellerBefore}, expected ${delta}`);
}
console.log(`✅ claim settled: seller +${ethers.formatUnits(delta, 6)} USDT in block ${rcpt.blockNumber}`);
console.log(`   claim tx: https://sepolia.etherscan.io/tx/${claimTx.hash}`);
console.log(`\n🎉 receipt-anchored escrow verified end to end on Sepolia`);
