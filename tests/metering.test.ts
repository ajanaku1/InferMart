import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceForBaseUnits,
  evaluateSettlement,
} from "../packages/shared/metering.ts";

// ── priceForBaseUnits: generatedTokens → integer USDT base-units ──

test("zero generated tokens costs nothing", () => {
  assert.equal(priceForBaseUnits(0, 1000), 0);
});

test("prices a whole multiple of 1k tokens exactly", () => {
  // 2000 tokens at 1000 base-units / 1k tokens = 2000 base-units
  assert.equal(priceForBaseUnits(2000, 1000), 2000);
});

test("rounds the charge UP so the seller is never undercharged", () => {
  // 1 token at 1000/1k = 1.0 base-units → 1
  assert.equal(priceForBaseUnits(1, 1000), 1);
  // 1500 tokens at 1000/1k = 1500 base-units exactly
  assert.equal(priceForBaseUnits(1500, 1000), 1500);
  // 1 token at 1500/1k = 1.5 base-units → ceil → 2
  assert.equal(priceForBaseUnits(1, 1500), 2);
});

test("rejects non-finite or negative token counts (money path is defensive)", () => {
  assert.throws(() => priceForBaseUnits(-1, 1000));
  assert.throws(() => priceForBaseUnits(Number.NaN, 1000));
  assert.throws(() => priceForBaseUnits(10, -5));
});

// ── evaluateSettlement: price + session spend cap ──

const cfg = { pricePer1kBaseUnits: 1000, sessionCapBaseUnits: 1_000_000 };

test("a request within the cap is pending settlement with the right amount", () => {
  const r = evaluateSettlement({
    stats: { generatedTokens: 500, promptTokens: 20 },
    spentBaseUnits: 0,
    ...cfg,
  });
  assert.equal(r.amountBaseUnits, 500);
  assert.equal(r.status, "pending");
  assert.equal(r.reason, undefined);
});

test("spending up to exactly the cap is allowed", () => {
  const r = evaluateSettlement({
    stats: { generatedTokens: 1000, promptTokens: 0 },
    spentBaseUnits: 999_000,
    ...cfg,
  });
  assert.equal(r.amountBaseUnits, 1000);
  assert.equal(r.status, "pending");
});

test("a request that would exceed the cap is rejected and never charged", () => {
  const r = evaluateSettlement({
    stats: { generatedTokens: 2000, promptTokens: 0 },
    spentBaseUnits: 999_000,
    ...cfg,
  });
  assert.equal(r.status, "rejected");
  assert.match(r.reason ?? "", /cap/i);
  assert.equal(r.amountBaseUnits, 2000); // amount reported for the UI, but not sent
});

test("carries the meter readings through for the receipt", () => {
  const r = evaluateSettlement({
    stats: { generatedTokens: 42, promptTokens: 7 },
    spentBaseUnits: 0,
    ...cfg,
  });
  assert.equal(r.generatedTokens, 42);
  assert.equal(r.promptTokens, 7);
});
