import { test } from "node:test";
import assert from "node:assert/strict";
import { f32leViolation } from "../packages/shared/audio-guard.js";

// The guard for upstream tetherto/qvac#3221: malformed f32le audio must be
// rejected before it can reach (and wedge) the Whisper processing queue.

function chunkOf(bytes: number) {
  return { type: "base64", value: Buffer.alloc(bytes).toString("base64") };
}

test("a whole number of f32le samples passes", () => {
  assert.equal(f32leViolation(chunkOf(4), "f32le"), null);
  assert.equal(f32leViolation(chunkOf(64_000), "f32le"), null);
});

test("a buffer that is not a multiple of 4 bytes is rejected with a reason", () => {
  for (const bytes of [1, 2, 3, 5, 63_999]) {
    const reason = f32leViolation(chunkOf(bytes), "f32le");
    assert.match(reason ?? "", /not a whole number of f32le samples/);
  }
});

test("an empty buffer is rejected", () => {
  assert.match(f32leViolation(chunkOf(0), "f32le") ?? "", /empty/);
});

test("the format defaults to f32le when absent, so bad audio is still caught", () => {
  assert.notEqual(f32leViolation(chunkOf(3), undefined), null);
});

test("non-f32le formats are left to the SDK's own validation", () => {
  assert.equal(f32leViolation(chunkOf(3), "pcm16"), null);
});

test("absent or non-base64 chunks are left to the SDK's schema validation", () => {
  assert.equal(f32leViolation(undefined, "f32le"), null);
  assert.equal(f32leViolation({ type: "path", value: "/tmp/a.raw" }, "f32le"), null);
});
