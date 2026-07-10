import { test } from "node:test";
import assert from "node:assert/strict";
import DHT from "hyperdht";
import {
  canonicalReceiptPayload,
  signReceipt,
  verifyReceipt,
  type UsageReceipt,
} from "../packages/shared/receipts.ts";

// The provider signs with its Hyperswarm identity — the exact key the buyer
// already dialed. These tests use deterministic hyperdht keypairs.
const provider = DHT.keyPair(Buffer.alloc(32, 1));
const providerHex = provider.publicKey.toString("hex");
const stranger = DHT.keyPair(Buffer.alloc(32, 2));

const receipt: UsageReceipt = {
  v: 1,
  requestId: "req-42",
  modality: "stt",
  modelId: "727845ffedb0ae5f",
  units: 2597,
  unitKind: "audioMs",
  provider: providerHex,
  issuedAt: 1752130000000,
};

// ── canonical payload ──

test("canonical payload is stable regardless of key insertion order", () => {
  const shuffled = {
    issuedAt: receipt.issuedAt,
    provider: receipt.provider,
    unitKind: receipt.unitKind,
    units: receipt.units,
    modelId: receipt.modelId,
    modality: receipt.modality,
    requestId: receipt.requestId,
    v: receipt.v,
  } as UsageReceipt;
  assert.deepEqual(canonicalReceiptPayload(shuffled), canonicalReceiptPayload(receipt));
});

test("canonical payload changes when any billed field changes", () => {
  const base = canonicalReceiptPayload(receipt);
  assert.notDeepEqual(canonicalReceiptPayload({ ...receipt, units: receipt.units + 1 }), base);
  assert.notDeepEqual(canonicalReceiptPayload({ ...receipt, requestId: "req-43" }), base);
  assert.notDeepEqual(canonicalReceiptPayload({ ...receipt, modality: "tts" }), base);
});

// ── sign / verify round-trip ──

test("a receipt signed by the provider verifies against its public key", () => {
  const signed = signReceipt(receipt, provider.secretKey);
  assert.equal(typeof signed.signature, "string");
  assert.ok(verifyReceipt(signed, providerHex));
});

test("verification fails when the amount of billed units is tampered", () => {
  const signed = signReceipt(receipt, provider.secretKey);
  const tampered = { ...signed, units: signed.units * 10 };
  assert.equal(verifyReceipt(tampered, providerHex), false);
});

test("verification fails when any other field is tampered", () => {
  const signed = signReceipt(receipt, provider.secretKey);
  assert.equal(verifyReceipt({ ...signed, requestId: "req-999" }, providerHex), false);
  assert.equal(verifyReceipt({ ...signed, modality: "llm" }, providerHex), false);
  assert.equal(verifyReceipt({ ...signed, modelId: "deadbeef" }, providerHex), false);
  assert.equal(verifyReceipt({ ...signed, issuedAt: signed.issuedAt + 1 }, providerHex), false);
});

test("verification fails against a different provider key", () => {
  const signed = signReceipt(receipt, provider.secretKey);
  assert.equal(verifyReceipt(signed, stranger.publicKey.toString("hex")), false);
});

test("a receipt signed by an impostor key does not verify as the provider", () => {
  const forged = signReceipt(receipt, stranger.secretKey);
  assert.equal(verifyReceipt(forged, providerHex), false);
});

test("the provider field must match the verifying key (no key substitution)", () => {
  // Impostor signs a receipt claiming to be from itself; buyer must still
  // reject it because it expected the dialed provider's key.
  const claimed = { ...receipt, provider: stranger.publicKey.toString("hex") };
  const forged = signReceipt(claimed, stranger.secretKey);
  assert.equal(verifyReceipt(forged, providerHex), false);
});

test("malformed signature strings are rejected, not thrown", () => {
  const signed = signReceipt(receipt, provider.secretKey);
  assert.equal(verifyReceipt({ ...signed, signature: "zz-not-hex" }, providerHex), false);
  assert.equal(verifyReceipt({ ...signed, signature: "" }, providerHex), false);
});
