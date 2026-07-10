import { test } from "node:test";
import assert from "node:assert/strict";
import DHT from "hyperdht";
import {
  signAccessClaim,
  verifyAccessClaim,
  decideAdmissions,
  type AccessClaim,
  type ObservedTransfer,
} from "../packages/seller/gatekeeper.ts";

const buyer = DHT.keyPair(Buffer.alloc(32, 3));
const buyerHex = buyer.publicKey.toString("hex");
const BUYER_ADDR = "0x1111111111111111111111111111111111111111";
const OTHER_ADDR = "0x2222222222222222222222222222222222222222";

const config = { minDepositBaseUnits: 500_000, minConfirmations: 2 };

function claim(): AccessClaim {
  return signAccessClaim({ swarmKey: buyerHex, senderAddress: BUYER_ADDR }, buyer.secretKey);
}

function transfer(over: Partial<ObservedTransfer> = {}): ObservedTransfer {
  return {
    from: BUYER_ADDR,
    amountBaseUnits: 500_000,
    confirmations: 2,
    txHash: "0xabc",
    ...over,
  };
}

// ── claim signatures: the deposit sender proves it owns the swarm key ──

test("a signed access claim verifies against the claimed swarm key", () => {
  assert.ok(verifyAccessClaim(claim()));
});

test("a claim with a tampered address or key is rejected", () => {
  const c = claim();
  assert.equal(verifyAccessClaim({ ...c, senderAddress: OTHER_ADDR }), false);
  const stranger = DHT.keyPair(Buffer.alloc(32, 4));
  assert.equal(verifyAccessClaim({ ...c, swarmKey: stranger.publicKey.toString("hex") }), false);
});

// ── admission decisions: claim + confirmed deposit → firewall allowlist ──

test("a confirmed deposit at/above the minimum admits the claimed key", () => {
  const admitted = decideAdmissions([claim()], [transfer()], config);
  assert.deepEqual(admitted, [buyerHex]);
});

test("an unconfirmed deposit does not admit yet", () => {
  const admitted = decideAdmissions([claim()], [transfer({ confirmations: 1 })], config);
  assert.deepEqual(admitted, []);
});

test("a deposit below the minimum does not admit", () => {
  const admitted = decideAdmissions([claim()], [transfer({ amountBaseUnits: 499_999 })], config);
  assert.deepEqual(admitted, []);
});

test("smaller deposits from the same sender accumulate to the minimum", () => {
  const admitted = decideAdmissions(
    [claim()],
    [
      transfer({ amountBaseUnits: 300_000, txHash: "0x1" }),
      transfer({ amountBaseUnits: 200_000, txHash: "0x2" }),
    ],
    config,
  );
  assert.deepEqual(admitted, [buyerHex]);
});

test("a transfer from an unclaimed address admits nobody", () => {
  const admitted = decideAdmissions([claim()], [transfer({ from: OTHER_ADDR })], config);
  assert.deepEqual(admitted, []);
});

test("a claim with an invalid signature admits nobody even with a valid deposit", () => {
  const forged = { ...claim(), senderAddress: OTHER_ADDR }; // signature no longer covers this
  const admitted = decideAdmissions([forged], [transfer({ from: OTHER_ADDR })], config);
  assert.deepEqual(admitted, []);
});

test("address comparison is case-insensitive (checksummed vs lowercase)", () => {
  const admitted = decideAdmissions(
    [claim()],
    [transfer({ from: BUYER_ADDR.toUpperCase().replace("0X", "0x") })],
    config,
  );
  assert.deepEqual(admitted, [buyerHex]);
});

test("a claim can authorize companion keys, all admitted by one deposit", () => {
  // The buyer runs two Hyperswarm identities (SDK delegation + raw channel)
  // but pays once; the claim, signed by the primary key, authorizes both.
  const companion = DHT.keyPair(Buffer.alloc(32, 7));
  const companionHex = companion.publicKey.toString("hex");
  const c = signAccessClaim(
    { swarmKey: buyerHex, senderAddress: BUYER_ADDR, companionKeys: [companionHex] },
    buyer.secretKey,
  );
  assert.ok(verifyAccessClaim(c));
  const admitted = decideAdmissions([c], [transfer()], config);
  assert.deepEqual(admitted.sort(), [buyerHex, companionHex].sort());
});

test("companion keys are covered by the signature (cannot be appended after signing)", () => {
  const c = signAccessClaim({ swarmKey: buyerHex, senderAddress: BUYER_ADDR }, buyer.secretKey);
  const injected = { ...c, companionKeys: ["ff".repeat(32)] };
  assert.equal(verifyAccessClaim(injected), false);
});

test("multiple claims admit independently and without duplicates", () => {
  const buyer2 = DHT.keyPair(Buffer.alloc(32, 5));
  const c2 = signAccessClaim(
    { swarmKey: buyer2.publicKey.toString("hex"), senderAddress: OTHER_ADDR },
    buyer2.secretKey,
  );
  const admitted = decideAdmissions(
    [claim(), claim(), c2],
    [transfer(), transfer({ from: OTHER_ADDR, txHash: "0xdef" })],
    config,
  );
  assert.deepEqual(admitted.sort(), [buyerHex, buyer2.publicKey.toString("hex")].sort());
});

test("the same transfer observed twice (poll overlap) is counted once", () => {
  const admitted = decideAdmissions(
    [claim()],
    [
      transfer({ amountBaseUnits: 300_000, txHash: "0xsame" }),
      transfer({ amountBaseUnits: 300_000, txHash: "0xsame" }),
    ],
    config,
  );
  assert.deepEqual(admitted, []); // 300k counted once — below the 500k minimum
});

test("one deposit admits at most one key: first valid claim per address wins", () => {
  const squatter = DHT.keyPair(Buffer.alloc(32, 6));
  const squat = signAccessClaim(
    { swarmKey: squatter.publicKey.toString("hex"), senderAddress: BUYER_ADDR },
    squatter.secretKey,
  );
  const admitted = decideAdmissions([claim(), squat], [transfer()], config);
  assert.deepEqual(admitted, [buyerHex]);
});
