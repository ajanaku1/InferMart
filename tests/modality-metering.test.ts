import { test } from "node:test";
import assert from "node:assert/strict";
import {
  priceForUnits,
  evaluateLegSettlement,
  type ModalityPrices,
} from "../packages/shared/metering.ts";

// Per Goal.md: per-unit price per modality — audio-seconds (stt), 1k tokens (llm),
// characters (tts). All prices in integer USDT base-units (6 decimals).
const prices: ModalityPrices = {
  stt: { unitKind: "audioMs", baseUnitsPer: 100, per: 1000 }, // 100 base-units per audio-second
  llm: { unitKind: "tokens", baseUnitsPer: 1000, per: 1000 }, // 1000 base-units per 1k tokens
  tts: { unitKind: "chars", baseUnitsPer: 50, per: 100 }, // 50 base-units per 100 chars
};

// ── priceForUnits ──

test("prices an exact block per modality", () => {
  assert.equal(priceForUnits("stt", 2000, prices), 200); // 2s of audio
  assert.equal(priceForUnits("llm", 2000, prices), 2000); // 2k tokens
  assert.equal(priceForUnits("tts", 200, prices), 100); // 200 chars
});

test("rounds partial blocks UP so the seller is never undercharged", () => {
  assert.equal(priceForUnits("stt", 2597, prices), 260); // 2.597s → 259.7 → 260
  assert.equal(priceForUnits("llm", 1, prices), 1);
  assert.equal(priceForUnits("tts", 1, prices), 1); // 0.5 → 1
});

test("zero units cost nothing", () => {
  assert.equal(priceForUnits("stt", 0, prices), 0);
  assert.equal(priceForUnits("llm", 0, prices), 0);
  assert.equal(priceForUnits("tts", 0, prices), 0);
});

test("rejects negative or non-finite unit counts", () => {
  assert.throws(() => priceForUnits("stt", -1, prices));
  assert.throws(() => priceForUnits("llm", Number.NaN, prices));
  assert.throws(() => priceForUnits("tts", Infinity, prices));
});

// ── evaluateLegSettlement: price one pipeline leg + session cap ──

test("a leg within the cap is pending with the right amount and unit kind", () => {
  const r = evaluateLegSettlement({
    modality: "stt",
    units: 2597,
    prices,
    spentBaseUnits: 0,
    sessionCapBaseUnits: 1_000_000,
  });
  assert.equal(r.amountBaseUnits, 260);
  assert.equal(r.unitKind, "audioMs");
  assert.equal(r.status, "pending");
});

test("a leg that would exceed the cap is rejected and never charged", () => {
  const r = evaluateLegSettlement({
    modality: "llm",
    units: 2000,
    prices,
    spentBaseUnits: 999_000,
    sessionCapBaseUnits: 1_000_000,
  });
  assert.equal(r.status, "rejected");
  assert.match(r.reason ?? "", /cap/i);
});

test("spending up to exactly the cap is allowed", () => {
  const r = evaluateLegSettlement({
    modality: "tts",
    units: 200, // 100 base-units
    prices,
    spentBaseUnits: 999_900,
    sessionCapBaseUnits: 1_000_000,
  });
  assert.equal(r.status, "pending");
  assert.equal(r.amountBaseUnits, 100);
});

test("rejects a non-positive pricing block size (config error, money path)", () => {
  const bad: ModalityPrices = { ...prices, stt: { unitKind: "audioMs", baseUnitsPer: 100, per: 0 } };
  assert.throws(() => priceForUnits("stt", 1000, bad));
});
