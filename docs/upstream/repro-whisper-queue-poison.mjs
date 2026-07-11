/**
 * Minimal repro — a malformed f32le buffer permanently poisons the Whisper
 * processing queue (tetherto/qvac#3221).
 *
 *   node docs/upstream/repro-whisper-queue-poison.mjs
 *
 * Sequence: valid transcribe (works) → malformed buffer (should fail alone)
 * → valid transcribe again. On @qvac/sdk 0.13.5 the third call never
 * recovers: it fails or hangs until the provider process restarts.
 */
import { loadModel, transcribe, close, WHISPER_TINY } from "@qvac/sdk";

const SAMPLE_RATE = 16_000;

/** One second of a 440 Hz sine — valid f32le, loud enough to be "speech-like". */
function validAudio() {
  const samples = new Float32Array(SAMPLE_RATE);
  for (let i = 0; i < samples.length; i++) samples[i] = 0.25 * Math.sin((2 * Math.PI * 440 * i) / SAMPLE_RATE);
  return Buffer.from(samples.buffer);
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise.then((v) => ({ ok: true, value: v })),
    new Promise((r) => setTimeout(() => r({ ok: false, value: `TIMEOUT after ${ms / 1000}s` }), ms)),
  ]).then(async (r) => (r.ok ? { status: "ok", detail: String(r.value).slice(0, 60) } : { status: "hung", detail: r.value }))
    .catch((e) => ({ status: "error", detail: String(e?.message ?? e).slice(0, 120) }));
}

// audio_format belongs in the LOAD config (matches the filed repro exactly);
// setting it per-call routes through a different decode path that tolerates
// truncated buffers and does not reproduce the bug.
const modelId = await loadModel({
  modelSrc: WHISPER_TINY,
  modelConfig: { audio_format: "f32le", strategy: "greedy", n_threads: 4, language: "en", no_timestamps: true },
  onProgress: (p) => process.stdout.write(`\rloading ${p.percentage.toFixed(0)}%`),
});
console.log(`\nloaded ${modelId}`);

const valid = validAudio();
const malformed = valid.subarray(0, valid.byteLength - 2); // 2 bytes short: not a whole f32 sample

const step = async (label, audio) => {
  const result = await withTimeout(
    Promise.resolve(transcribe({ modelId, audioChunk: audio })),
    60_000,
    label,
  );
  console.log(`${label}: ${result.status}${result.detail ? ` (${result.detail})` : ""}`);
  return result;
};

const first = await step("1. valid audio ", valid);
await step("2. malformed    ", malformed);
const third = await step("3. valid again  ", valid);

if (first.status === "ok" && third.status !== "ok") {
  console.log("→ QUEUE POISONED (bug reproduced): a later valid request fails after one malformed buffer");
} else if (first.status === "ok" && third.status === "ok") {
  console.log("→ recovered cleanly: the malformed request failed alone (bug not reproduced)");
} else {
  console.log("→ inconclusive: the first valid request did not succeed");
}

void close();
setTimeout(() => process.exit(0), 3000);
