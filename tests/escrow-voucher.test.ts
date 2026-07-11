import { test } from "node:test";
import assert from "node:assert/strict";
import { ethers } from "ethers";
import DHT from "hyperdht";
import { signReceipt, type UsageReceipt } from "../packages/shared/receipts.ts";
import {
  channelIdOf,
  receiptHashOf,
  signVoucher,
  recoverVoucherSigner,
  computeClaimDelta,
  type VoucherFields,
} from "../packages/shared/escrow-voucher.ts";

// Deterministic fixtures: a provider Hyperswarm identity for receipts and a
// buyer EVM wallet for vouchers. Sepolia chain id, throwaway contract address.
const providerKeys = DHT.keyPair(Buffer.alloc(32, 7));
const buyer = new ethers.Wallet("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const other = new ethers.Wallet("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
const DOMAIN = { chainId: 11155111n, verifyingContract: "0x1111111111111111111111111111111111111111" };

const RECEIPT: UsageReceipt = {
  v: 1,
  requestId: "req-abc123",
  modality: "llm",
  modelId: "llama-3.2-1b",
  units: 45,
  unitKind: "tokens",
  provider: providerKeys.publicKey.toString("hex"),
  issuedAt: 1752105600000,
};

function fields(overrides: Partial<VoucherFields> = {}): VoucherFields {
  const signed = signReceipt(RECEIPT, providerKeys.secretKey);
  return {
    channelId: channelIdOf(buyer.address, other.address, "0x2222222222222222222222222222222222222222"),
    epoch: 0n,
    cumulativeAmount: 45n,
    receiptHash: receiptHashOf(signed),
    ...overrides,
  };
}

test("receiptHash is deterministic for the same signed receipt", () => {
  const a = receiptHashOf(signReceipt(RECEIPT, providerKeys.secretKey));
  const b = receiptHashOf(signReceipt(RECEIPT, providerKeys.secretKey));
  assert.equal(a, b);
});

test("receiptHash changes when any billed field changes", () => {
  const base = receiptHashOf(signReceipt(RECEIPT, providerKeys.secretKey));
  const bumped = receiptHashOf(signReceipt({ ...RECEIPT, units: 46 }, providerKeys.secretKey));
  assert.notEqual(base, bumped);
});

test("receiptHash commits to the provider signature, not just the contents", () => {
  const real = signReceipt(RECEIPT, providerKeys.secretKey);
  const forged = { ...real, signature: "00".repeat(64) };
  assert.notEqual(receiptHashOf(real), receiptHashOf(forged));
});

test("a signed voucher recovers to the buyer's address", async () => {
  const f = fields();
  const sig = await signVoucher(buyer, DOMAIN, f);
  assert.equal(recoverVoucherSigner(DOMAIN, f, sig), buyer.address);
});

test("tampering with the cumulative amount breaks recovery", async () => {
  const f = fields();
  const sig = await signVoucher(buyer, DOMAIN, f);
  const recovered = recoverVoucherSigner(DOMAIN, { ...f, cumulativeAmount: f.cumulativeAmount + 1n }, sig);
  assert.notEqual(recovered, buyer.address);
});

test("tampering with the receipt hash breaks recovery", async () => {
  const f = fields();
  const sig = await signVoucher(buyer, DOMAIN, f);
  const recovered = recoverVoucherSigner(DOMAIN, { ...f, receiptHash: ethers.keccak256("0xdead") }, sig);
  assert.notEqual(recovered, buyer.address);
});

test("a voucher from one epoch is not valid for another", async () => {
  const f = fields();
  const sig = await signVoucher(buyer, DOMAIN, f);
  const recovered = recoverVoucherSigner(DOMAIN, { ...f, epoch: 1n }, sig);
  assert.notEqual(recovered, buyer.address);
});

test("a voucher signed by someone other than the buyer does not recover to the buyer", async () => {
  const f = fields();
  const sig = await signVoucher(other, DOMAIN, f);
  assert.notEqual(recoverVoucherSigner(DOMAIN, f, sig), buyer.address);
});

test("a voucher is bound to its chain and contract", async () => {
  const f = fields();
  const sig = await signVoucher(buyer, DOMAIN, f);
  const otherDomain = { ...DOMAIN, verifyingContract: "0x3333333333333333333333333333333333333333" };
  assert.notEqual(recoverVoucherSigner(otherDomain, f, sig), buyer.address);
});

test("channel ids are deterministic and distinct per counterparty", () => {
  const t = "0x2222222222222222222222222222222222222222";
  assert.equal(channelIdOf(buyer.address, other.address, t), channelIdOf(buyer.address, other.address, t));
  assert.notEqual(channelIdOf(buyer.address, other.address, t), channelIdOf(other.address, buyer.address, t));
});

test("claim delta pays exactly the newly vouched amount", () => {
  assert.equal(computeClaimDelta(100n, 1000n, 145n), 45n);
});

test("a stale or replayed voucher pays nothing", () => {
  assert.throws(() => computeClaimDelta(145n, 1000n, 145n), /nothing new/);
  assert.throws(() => computeClaimDelta(145n, 1000n, 100n), /nothing new/);
});

test("a voucher can never pay out more than the deposit", () => {
  assert.throws(() => computeClaimDelta(0n, 1000n, 1001n), /exceeds the deposit/);
  assert.equal(computeClaimDelta(0n, 1000n, 1000n), 1000n); // spending to exactly the deposit is allowed
});
