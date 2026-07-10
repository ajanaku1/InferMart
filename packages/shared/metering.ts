/**
 * InferMart metering — the money path (TDD'd in tests/metering.test.ts).
 *
 * Turns a QVAC meter reading into an integer USDT amount and decides whether the
 * buyer's session spend cap permits the charge. Integers only (USDT base-units,
 * 6 decimals) — no floats touch a balance.
 */

import type { MeterStats, SettlementStatus } from "./protocol.ts";
import type { Modality, UnitKind } from "./receipts.ts";

function assertNonNegInt(n: number, label: string): void {
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError(`${label} must be a finite, non-negative number (got ${n})`);
  }
}

/**
 * Price for `generatedTokens` at `pricePer1kBaseUnits` per 1000 tokens.
 * Rounds UP so the seller is never undercharged for a partial 1k block.
 */
export function priceForBaseUnits(
  generatedTokens: number,
  pricePer1kBaseUnits: number,
): number {
  assertNonNegInt(generatedTokens, "generatedTokens");
  assertNonNegInt(pricePer1kBaseUnits, "pricePer1kBaseUnits");
  return Math.ceil((generatedTokens * pricePer1kBaseUnits) / 1000);
}

/** Price rule for one modality: `baseUnitsPer` USDT base-units per `per` units. */
export interface ModalityPrice {
  unitKind: UnitKind;
  baseUnitsPer: number;
  per: number;
}

export type ModalityPrices = Record<Modality, ModalityPrice>;

/** Per-modality prices from env, with demo-friendly defaults (USDT base-units). */
export function modalityPricesFromEnv(env = process.env): ModalityPrices {
  return {
    stt: { unitKind: "audioMs", baseUnitsPer: Number(env.PRICE_STT_PER_SECOND_BASEUNITS ?? 100), per: 1000 },
    llm: { unitKind: "tokens", baseUnitsPer: Number(env.PRICE_PER_1K_TOKENS_BASEUNITS ?? 1000), per: 1000 },
    tts: { unitKind: "chars", baseUnitsPer: Number(env.PRICE_TTS_PER_100_CHARS_BASEUNITS ?? 50), per: 100 },
  };
}

/**
 * Price `units` of a modality. Rounds UP per started block, same rule as
 * `priceForBaseUnits` — the seller is never undercharged.
 */
export function priceForUnits(modality: Modality, units: number, prices: ModalityPrices): number {
  const { baseUnitsPer, per } = prices[modality];
  assertNonNegInt(units, `${modality} units`);
  assertNonNegInt(baseUnitsPer, "baseUnitsPer");
  if (!Number.isFinite(per) || per <= 0) {
    throw new RangeError(`pricing block size must be positive (got ${per})`);
  }
  return Math.ceil((units * baseUnitsPer) / per);
}

export interface LegSettlementDecision {
  modality: Modality;
  unitKind: UnitKind;
  units: number;
  amountBaseUnits: number;
  status: Extract<SettlementStatus, "pending" | "rejected">;
  reason?: string;
}

export interface EvaluateLegArgs {
  modality: Modality;
  units: number;
  prices: ModalityPrices;
  spentBaseUnits: number;
  sessionCapBaseUnits: number;
}

/** Price one pipeline leg and check it against the buyer's running session cap. */
export function evaluateLegSettlement(args: EvaluateLegArgs): LegSettlementDecision {
  const { modality, units, prices, spentBaseUnits, sessionCapBaseUnits } = args;
  assertNonNegInt(spentBaseUnits, "spentBaseUnits");
  assertNonNegInt(sessionCapBaseUnits, "sessionCapBaseUnits");

  const amountBaseUnits = priceForUnits(modality, units, prices);
  const overCap = spentBaseUnits + amountBaseUnits > sessionCapBaseUnits;

  return {
    modality,
    unitKind: prices[modality].unitKind,
    units,
    amountBaseUnits,
    status: overCap ? "rejected" : "pending",
    ...(overCap && {
      reason: `session spend cap reached (${spentBaseUnits}+${amountBaseUnits} > ${sessionCapBaseUnits} base-units)`,
    }),
  };
}

export interface SettlementDecision {
  amountBaseUnits: number;
  generatedTokens: number;
  promptTokens: number;
  status: Extract<SettlementStatus, "pending" | "rejected">;
  reason?: string;
}

export interface EvaluateSettlementArgs {
  stats: MeterStats;
  spentBaseUnits: number;
  pricePer1kBaseUnits: number;
  sessionCapBaseUnits: number;
}

/**
 * Price a completed request and check it against the buyer's running session cap.
 * Over-cap requests are `rejected` (and must never be sent on-chain); the amount is
 * still reported so the dashboard can explain why the request was blocked.
 */
export function evaluateSettlement(args: EvaluateSettlementArgs): SettlementDecision {
  const { stats, spentBaseUnits, pricePer1kBaseUnits, sessionCapBaseUnits } = args;
  assertNonNegInt(spentBaseUnits, "spentBaseUnits");
  assertNonNegInt(sessionCapBaseUnits, "sessionCapBaseUnits");

  const amountBaseUnits = priceForBaseUnits(stats.generatedTokens, pricePer1kBaseUnits);
  const overCap = spentBaseUnits + amountBaseUnits > sessionCapBaseUnits;

  return {
    amountBaseUnits,
    generatedTokens: stats.generatedTokens,
    promptTokens: stats.promptTokens,
    status: overCap ? "rejected" : "pending",
    ...(overCap && {
      reason: `session spend cap reached (${spentBaseUnits}+${amountBaseUnits} > ${sessionCapBaseUnits} base-units)`,
    }),
  };
}
