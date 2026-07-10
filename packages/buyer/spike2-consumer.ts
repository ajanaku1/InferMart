/**
 * Phase-2 Spike A — BUYER side.
 * Delegates Whisper `transcribe` and Supertonic `textToSpeech` to the provider
 * whose key is in .spike/phase2-provider-key.txt. Records whether each modality
 * actually serves over the delegated session and what usage metrics come back.
 */
import { readFile, writeFile } from "node:fs/promises";
import { loadModel, transcribe, textToSpeech, close, WHISPER_TINY, TTS_EN_SUPERTONIC_Q8_0 } from "@qvac/sdk";

const providerPublicKey = (await readFile(".spike/phase2-provider-key.txt", "utf8")).trim();
const AUDIO_FILE = ".spike/phase2/voice-note.wav";
console.log(`🛒 buyer: delegating STT/TTS to provider ${providerPublicKey.slice(0, 16)}…`);

const delegate = { providerPublicKey, timeout: 120_000, fallbackToLocal: false };

// ── Leg 1: delegated Whisper transcription ──────────────────────────────
let sttOk = false;
let transcript = "";
try {
  const t0 = Date.now();
  const asrModelId = await loadModel({
    modelSrc: WHISPER_TINY,
    modelConfig: {
      audio_format: "f32le",
      strategy: "greedy",
      n_threads: 4,
      language: "en",
      no_timestamps: true,
      suppress_blank: true,
      suppress_nst: true,
      temperature: 0.0,
    },
    delegate,
  });
  console.log(`✅ buyer: whisper registered (${asrModelId}) in ${Date.now() - t0}ms`);
  const audio = await readFile(AUDIO_FILE);
  transcript = await transcribe({ modelId: asrModelId, audioChunk: audio });
  sttOk = transcript.trim().length > 0;
  console.log(`📨 delegated transcript: "${transcript.trim()}"`);
} catch (err) {
  console.error("❌ delegated transcribe FAILED:", (err as Error).message);
}

// ── Leg 2: delegated TTS ────────────────────────────────────────────────
let ttsOk = false;
let ttsSamples = 0;
try {
  const t0 = Date.now();
  const ttsModelId = await loadModel({
    modelSrc: TTS_EN_SUPERTONIC_Q8_0,
    modelConfig: {
      ttsEngine: "supertonic",
      language: "en",
      voice: "F1",
      ttsSpeed: 1.05,
      ttsNumInferenceSteps: 5,
    },
    delegate,
  });
  console.log(`✅ buyer: tts registered (${ttsModelId}) in ${Date.now() - t0}ms`);
  const result = textToSpeech({
    modelId: ttsModelId,
    text: "Payment settled. Your peer to peer inference is ready.",
    inputType: "text",
    stream: false,
  });
  const buffer = await result.buffer;
  ttsSamples = buffer.length;
  ttsOk = ttsSamples > 0;
  // Persist PCM so we can verify it is real audio, not zeros.
  const pcm = Buffer.alloc(ttsSamples * 2);
  for (let i = 0; i < ttsSamples; i++) {
    const v = Math.max(-1, Math.min(1, buffer[i]!));
    pcm.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  await writeFile(".spike/phase2/tts-out.pcm", pcm);
} catch (err) {
  console.error("❌ delegated textToSpeech FAILED:", (err as Error).message);
}

console.log("\n── SPIKE A RESULT ───────────────────────────");
console.log(`delegated transcribe works    : ${sttOk ? "YES" : "NO"}`);
console.log(`delegated textToSpeech works  : ${ttsOk ? "YES" : "NO"}`);
console.log(`tts samples returned          : ${ttsSamples}`);
console.log("─────────────────────────────────────────────");

void close();
