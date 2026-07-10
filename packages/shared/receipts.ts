/**
 * Provider-signed usage receipts — the money path (TDD'd in tests/receipts.test.ts).
 *
 * The seller's metering plugin counts usage inside its QVAC worker and signs a
 * receipt with the provider's Hyperswarm ed25519 identity — the same key the
 * buyer dialed to reach it, so no extra PKI is needed. The buyer verifies the
 * signature (and that the signer is the provider it dialed) before settling.
 *
 * Typed façade over receipt-signing.js, which is plain JS because it also runs
 * inside the seller's Bare worker (bundled by bare-pack, no TS there).
 */
import {
  canonicalReceiptPayload as canonicalJs,
  signReceipt as signJs,
  verifyReceipt as verifyJs,
} from "./receipt-signing.js";

export type Modality = "stt" | "llm" | "tts";
export type UnitKind = "audioMs" | "tokens" | "chars";

/** What the provider attests: this request consumed `units` of `unitKind`. */
export interface UsageReceipt {
  v: 1;
  requestId: string;
  modality: Modality;
  modelId: string;
  units: number;
  unitKind: UnitKind;
  /** Hex public key of the signing provider (its Hyperswarm identity). */
  provider: string;
  issuedAt: number;
}

export interface SignedUsageReceipt extends UsageReceipt {
  /** Hex ed25519 signature over the canonical payload. */
  signature: string;
}

/** Deterministic bytes for signing: fixed field order, JSON-encoded. */
export function canonicalReceiptPayload(r: UsageReceipt): Buffer {
  return canonicalJs(r);
}

/** Sign with the provider's Hyperswarm secret key (ed25519). */
export function signReceipt(receipt: UsageReceipt, secretKey: Buffer): SignedUsageReceipt {
  return signJs(receipt, secretKey) as SignedUsageReceipt;
}

/**
 * True only if the signature covers this exact receipt AND the signer is the
 * provider the buyer dialed. Malformed input returns false, never throws.
 */
export function verifyReceipt(signed: SignedUsageReceipt, expectedProviderHex: string): boolean {
  return verifyJs(signed, expectedProviderHex);
}
