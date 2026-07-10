/**
 * Receipt signing core — plain JS because it runs in two runtimes:
 * Node (buyer verification, tests, via packages/shared/receipts.ts) and the
 * seller's Bare worker (the metering plugin bundled by bare-pack, which does
 * not transpile TypeScript). Only hypercore-crypto + plain JS in here.
 *
 * Field order in the canonical payload is part of the receipt format — never
 * reorder. TDD'd in tests/receipts.test.ts through the receipts.ts façade.
 */
import crypto from "hypercore-crypto";

/** @param {object} r @returns {Buffer} deterministic bytes for signing */
export function canonicalReceiptPayload(r) {
  return Buffer.from(
    JSON.stringify([r.v, r.requestId, r.modality, r.modelId, r.units, r.unitKind, r.provider, r.issuedAt]),
    "utf8",
  );
}

/** @param {object} receipt @param {Buffer} secretKey */
export function signReceipt(receipt, secretKey) {
  const signature = crypto.sign(canonicalReceiptPayload(receipt), secretKey).toString("hex");
  return { ...receipt, signature };
}

/** @param {object} signed @param {string} expectedProviderHex */
export function verifyReceipt(signed, expectedProviderHex) {
  if (signed.provider !== expectedProviderHex) return false;
  try {
    const signature = Buffer.from(signed.signature, "hex");
    const publicKey = Buffer.from(expectedProviderHex, "hex");
    const { signature: _drop, ...receipt } = signed;
    return crypto.verify(canonicalReceiptPayload(receipt), signature, publicKey);
  } catch {
    return false;
  }
}
