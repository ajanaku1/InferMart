/**
 * InferMart P2P message contract — FROZEN (Day 0, api-design-principles).
 *
 * QVAC owns the inference transport (history in, streamed tokens out, `final.stats`).
 * These types are the thin app-level envelope both dashboards and both peer processes
 * speak, regardless of transport. They are also the SSE event payloads the UIs render.
 *
 * Versioned so a later schema change is detectable; `requestId` is the idempotency key
 * that makes settlement at-most-once.
 */

export const PROTOCOL_VERSION = 1 as const;

/** One turn in a chat history, mirroring the shape `@qvac/sdk` completion() expects. */
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Buyer → seller: a request for inference. `requestId` keys metering + settlement. */
export interface InferenceRequest {
  v: typeof PROTOCOL_VERSION;
  requestId: string;
  prompt: string;
  history: Message[];
  createdAt: number;
}

/** Seller → buyer: one streamed token (or the terminal marker). */
export interface StreamChunk {
  v: typeof PROTOCOL_VERSION;
  requestId: string;
  seq: number;
  token: string;
  done: boolean;
}

/**
 * The meter reading QVAC returns at the end of a run. We bill off `generatedTokens`
 * (the field the OpenAI-compat layer bills on); `promptTokens` is recorded for the UI.
 */
export interface MeterStats {
  generatedTokens: number;
  promptTokens: number;
}

export type SettlementStatus = "pending" | "settled" | "rejected" | "failed";

/** Buyer → seller (and to both dashboards): proof of payment for one request. */
export interface SettlementReceipt {
  v: typeof PROTOCOL_VERSION;
  requestId: string;
  generatedTokens: number;
  promptTokens: number;
  /** Integer USDT base-units (6 decimals). 1_000000 = 1 USDT. */
  amountBaseUnits: number;
  status: SettlementStatus;
  /** Present once the on-chain transfer lands. */
  txHash?: string;
  chain?: string;
  explorerUrl?: string;
  /** Set when status is "rejected" (over cap) or "failed" (tx error). */
  reason?: string;
}

// ── Phase 2: voice pipeline, signed receipts, market, deposit gate ──

import type { Modality, UnitKind, SignedUsageReceipt } from "./receipts.ts";

/** One leg of the voice pipeline as rendered by the dashboards. */
export interface VoiceLegUpdate {
  v: typeof PROTOCOL_VERSION;
  /** Correlates all legs of one voice note. */
  voiceId: string;
  /** The QVAC requestId of this leg (keys the provider-signed receipt). */
  requestId: string;
  leg: Modality;
  phase: "heartbeat" | "running" | "verifying" | "settling" | "done" | "failed" | "skipped";
  /** Transcript (stt) or reply text (llm) once available. */
  text?: string;
  /** Heartbeat round-trip in ms, when phase === "heartbeat" succeeded. */
  latencyMs?: number;
  /** The provider-signed usage receipt, once fetched and verified. */
  usageReceipt?: SignedUsageReceipt;
  receiptVerified?: boolean;
  /** Per-leg settlement outcome. */
  settlement?: LegReceipt;
  error?: string;
}

/** Per-leg settlement receipt (Phase-2 sibling of SettlementReceipt). */
export interface LegReceipt {
  v: typeof PROTOCOL_VERSION;
  requestId: string;
  modality: Modality;
  unitKind: UnitKind;
  units: number;
  amountBaseUnits: number;
  status: SettlementStatus;
  txHash?: string;
  chain?: string;
  explorerUrl?: string;
  reason?: string;
}

/** One row of the live market catalog (from the QVAC model registry). */
export interface CatalogEntry {
  name: string;
  src: string;
  modality: Modality | "other";
  hosted: boolean;
}

/** Deposit-gate progress, as seen by either side. */
export interface GateUpdate {
  phase: "closed" | "claim-submitted" | "deposit-sent" | "waiting-confirmations" | "admitted";
  swarmKey?: string;
  senderAddress?: string;
  txHash?: string;
  detail?: string;
}

/** SSE event names shared by both dashboards — one vocabulary across the app. */
export const SSE_EVENTS = {
  request: "request",
  chunk: "chunk",
  receipt: "receipt",
  balance: "balance",
  status: "status",
  voice: "voice",
  catalog: "catalog",
  heartbeat: "heartbeat",
  gate: "gate",
} as const;

export type SseEvent = (typeof SSE_EVENTS)[keyof typeof SSE_EVENTS];
