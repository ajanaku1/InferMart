/**
 * Phase-2 Spike A (part 2) — BUYER side, raw QVAC delegation protocol.
 *
 * Finding so far: in @qvac/sdk 0.13.5 the consumer RPC registry only routes
 * loadModel/completionStream/heartbeat/unloadModel/cancel to a provider; the
 * PROVIDER, however, proxies every inbound request type through handleRequest.
 * So we extend delegation to transcribe/textToSpeech ourselves by speaking the
 * SDK's own wire protocol: hyperdht connect → bare-rpc → zod-validated JSON
 * frames (NDJSON response stream for streaming handlers). Same relay, same
 * firewall, same provider — no SDK fork, no mock.
 */
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import DHT from "hyperdht";
import RPC from "bare-rpc";
// Subpath import: model descriptors only — avoids booting the SDK worker.
import { WHISPER_TINY, TTS_EN_SUPERTONIC_Q8_0 } from "@qvac/sdk/models";
// Direct dist import (not in the exports map, hence the file path): the SDK's
// own request-builder schema, so our wire frames are exactly what the client sends.
// @ts-expect-error untyped deep import
import { loadModelOptionsToRequestSchema } from "../../node_modules/@qvac/sdk/dist/schemas/index.js";

const providerPublicKey = (await readFile(".spike/phase2-provider-key.txt", "utf8")).trim();
const relayKey = (await readFile(".spike/relay-key.txt", "utf8")).trim();
const AUDIO_FILE = ".spike/phase2/voice-note.f32le"; // raw f32le 16kHz mono (matches audio_format)

console.log(`🛒 raw-rpc buyer: dialing provider ${providerPublicKey.slice(0, 16)}…`);

const dht = new DHT();
const keyPair = DHT.keyPair(randomBytes(32));
console.log(`   our ephemeral key: ${keyPair.publicKey.toString("hex").slice(0, 16)}…`);

const conn = dht.connect(Buffer.from(providerPublicKey, "hex"), {
  keyPair,
  relayThrough: [Buffer.from(relayKey, "hex")],
});
await new Promise<void>((resolve, reject) => {
  const to = setTimeout(() => reject(new Error("connect timeout")), 30_000);
  conn.once("open", () => { clearTimeout(to); resolve(); });
  conn.once("error", (e: Error) => { clearTimeout(to); reject(e); });
  conn.once("close", () => { clearTimeout(to); reject(new Error("closed before open")); });
});
console.log("✅ DHT connection open");

const rpc = new (RPC as any)(conn);
let cmdId = 0;

/** Single-reply request (loadModel without progress, heartbeat, pluginInvoke). */
async function send(request: Record<string, unknown>): Promise<any> {
  const req = rpc.request(++cmdId);
  req.send(JSON.stringify(request), "utf-8");
  const reply = await req.reply("utf-8");
  const payload = JSON.parse(reply?.toString() || "{}");
  if (payload.type === "error") throw new Error(`provider error: ${payload.message}`);
  return payload;
}

/** Streaming request → async iterator of NDJSON frames (transcribe, textToSpeech). */
async function* stream(request: Record<string, unknown>): AsyncGenerator<any> {
  const req = rpc.request(++cmdId);
  req.send(JSON.stringify(request), "utf-8");
  const responseStream = req.createResponseStream({ encoding: "utf-8" });
  let buffer = "";
  for await (const chunk of responseStream) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const payload = JSON.parse(line);
      if (payload.type === "error") throw new Error(`provider error: ${payload.message}`);
      yield payload;
    }
  }
}

// ── 0. heartbeat over the raw channel ───────────────────────────────────
const hb = await send({ type: "heartbeat" });
console.log(`💓 heartbeat: ${JSON.stringify(hb)}`);

// ── 1. remote loadModel (provider loads in ITS worker; no delegate field) ──
console.log("→ remote loadModel whisper-tiny…");
const whisperLoad = await send(loadModelOptionsToRequestSchema.parse({
  modelSrc: WHISPER_TINY,
  modelType: "whisper",
  modelConfig: {
    audio_format: "f32le", strategy: "greedy", n_threads: 4, language: "en",
    no_timestamps: true, suppress_blank: true, suppress_nst: true, temperature: 0.0,
  },
}));
console.log(`   loadModel reply: ${JSON.stringify(whisperLoad).slice(0, 200)}`);

let asrModelId: string = whisperLoad.modelId;

// ── 2. delegated transcribe over the raw channel ────────────────────────
let transcript = "";
let sttStats: any;
if (asrModelId) {
  const audio = await readFile(AUDIO_FILE);
  for await (const frame of stream({
    type: "transcribe",
    modelId: asrModelId,
    audioChunk: { type: "base64", value: audio.toString("base64") },
  })) {
    if (frame.text) transcript += frame.text;
    if (frame.stats) sttStats = frame.stats;
    if (frame.done) break;
  }
  console.log(`📨 raw delegated transcript: "${transcript.trim()}"`);
  console.log(`   stt stats: ${JSON.stringify(sttStats)}`);
}

// ── 3. remote loadModel TTS + delegated textToSpeech ────────────────────
console.log("→ remote loadModel supertonic…");
const ttsLoad = await send(loadModelOptionsToRequestSchema.parse({
  modelSrc: TTS_EN_SUPERTONIC_Q8_0,
  modelType: "tts",
  modelConfig: { ttsEngine: "supertonic", language: "en", voice: "F1", ttsSpeed: 1.05, ttsNumInferenceSteps: 5 },
}));
const ttsModelId: string = ttsLoad.modelId;
console.log(`   tts modelId: ${ttsModelId}`);

let ttsSamples: number[] = [];
let ttsStats: any;
if (ttsModelId) {
  for await (const frame of stream({
    type: "textToSpeech",
    modelId: ttsModelId,
    text: "Payment settled. Your peer to peer inference is ready.",
    inputType: "text",
    stream: false,
    sentenceStream: false,
  })) {
    if (Array.isArray(frame.buffer)) for (const v of frame.buffer) ttsSamples.push(v);
    if (frame.stats) ttsStats = frame.stats;
    if (frame.done) break;
  }
  console.log(`   tts stats: ${JSON.stringify(ttsStats)}, samples: ${ttsSamples.length}`);
  const pcm = Buffer.alloc(ttsSamples.length * 2);
  ttsSamples.forEach((v, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  await writeFile(".spike/phase2/tts-raw-out.pcm", pcm);
}

console.log("\n── SPIKE A (raw protocol) RESULT ────────────");
console.log(`raw delegated transcribe   : ${transcript.trim().length > 0 ? "YES" : "NO"}`);
console.log(`raw delegated textToSpeech : ${ttsSamples.length > 0 ? "YES" : "NO"}`);
console.log("─────────────────────────────────────────────");

conn.destroy();
await dht.destroy();
process.exit(0);
