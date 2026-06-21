/**
 * InferMart metering — the money path (TDD'd in tests/metering.test.ts).
 *
 * Turns a QVAC meter reading into an integer USDT amount and decides whether the
 * buyer's session spend cap permits the charge. Integers only (USDT base-units,
 * 6 decimals) — no floats touch a balance.
 */

import type { MeterStats, SettlementStatus } from "./protocol.ts";

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
