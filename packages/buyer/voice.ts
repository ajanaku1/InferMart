/**
 * Voice pipeline — the Phase-2 demo centerpiece.
 *
 * One voice note runs three delegated QVAC legs on the seller's provider:
 *   1. stt  — Whisper `transcribe` over the raw delegation channel
 *   2. llm  — chat completion over the SDK's built-in delegation
 *   3. tts  — Supertonic `textToSpeech` over the raw delegation channel
 *
 * Every leg is heartbeat-gated (no payment for a dead provider), metered by
 * the seller's in-worker plugin, attested by a provider-signed receipt the
 * buyer verifies before settling, and settled as its own USDT transfer.
 */
import { randomUUID } from "node:crypto";
import { heartbeat } from "@qvac/sdk";
import { WHISPER_TINY, TTS_EN_SUPERTONIC_Q8_0 } from "@qvac/sdk/models";
import type { DelegatedChannel } from "@infermart/shared/delegated-rpc";
import { verifyReceipt, type Modality, type SignedUsageReceipt } from "@infermart/shared/receipts";
import type { LegReceipt, VoiceLegUpdate } from "@infermart/shared/protocol";
import { PROTOCOL_VERSION, type Message } from "@infermart/shared/protocol";
import type { InferenceClient } from "./client.ts";

// @ts-expect-error untyped deep import — the SDK's own request-builder schema,
// so raw-channel loadModel frames are exactly what its client would send.
import { loadModelOptionsToRequestSchema } from "../../node_modules/@qvac/sdk/dist/schemas/index.js";

export interface VoicePipelineDeps {
  channel: DelegatedChannel;
  llm: InferenceClient;
  providerPublicKey: string;
  /** Settle one verified leg on-chain; returns the settlement receipt. */
  settleLeg(requestId: string, modality: Modality, units: number): Promise<LegReceipt>;
  onUpdate(update: VoiceLegUpdate): void;
}

export interface VoicePipelineResult {
  voiceId: string;
  transcript: string;
  reply: string;
  /** 16-bit PCM mono 44.1kHz of the spoken reply. */
  replyPcm: Buffer;
  legs: VoiceLegUpdate[];
}

const SYSTEM_PROMPT =
  "You are a concise voice assistant on a paid peer-to-peer inference market. " +
  "Answer in at most two short sentences. Plain prose only — your answer is spoken aloud.";

interface RemoteModels {
  asrModelId: string;
  ttsModelId: string;
  meterModelId: string;
}

/** Load Whisper + TTS + the metering plugin on the provider (idempotent). */
export async function loadVoiceModels(channel: DelegatedChannel): Promise<RemoteModels> {
  const asr = await channel.send<{ modelId: string }>(loadModelOptionsToRequestSchema.parse({
    modelSrc: WHISPER_TINY,
    modelType: "whisper",
    modelConfig: {
      audio_format: "f32le", strategy: "greedy", n_threads: 4, language: "en",
      no_timestamps: true, suppress_blank: true, suppress_nst: true, temperature: 0.0,
    },
  }));
  const tts = await channel.send<{ modelId: string }>(loadModelOptionsToRequestSchema.parse({
    modelSrc: TTS_EN_SUPERTONIC_Q8_0,
    modelType: "tts",
    modelConfig: { ttsEngine: "supertonic", language: "en", voice: "F1", ttsSpeed: 1.05, ttsNumInferenceSteps: 5 },
  }));
  const meter = await channel.send<{ modelId: string }>({
    type: "loadModel",
    modelType: "infermart-metering",
    modelSrc: "./package.json",
    modelConfig: {},
  });
  return { asrModelId: asr.modelId, ttsModelId: tts.modelId, meterModelId: meter.modelId };
}

export function createVoicePipeline(deps: VoicePipelineDeps, models: RemoteModels) {
  const { channel, llm, providerPublicKey, settleLeg, onUpdate } = deps;

  async function fetchReceipt(requestId: string, modality: Modality): Promise<SignedUsageReceipt | null> {
    const res = await channel.send<{ result: { receipt: SignedUsageReceipt | null } }>({
      type: "pluginInvoke",
      modelId: models.meterModelId,
      handler: "getReceipt",
      params: { modelId: models.meterModelId, requestId, modality },
    });
    return res.result?.receipt ?? null;
  }

  /** Heartbeat gate: never pay for (or even send) a request to a dead provider. */
  async function assertAlive(update: VoiceLegUpdate): Promise<number> {
    const t0 = Date.now();
    await heartbeat({ delegate: { providerPublicKey, timeout: 5000 } });
    const latencyMs = Date.now() - t0;
    onUpdate({ ...update, phase: "heartbeat", latencyMs });
    return latencyMs;
  }

  /** Shared tail of every leg: receipt → verify → settle. Throws on bad receipts. */
  async function attestAndSettle(update: VoiceLegUpdate): Promise<VoiceLegUpdate> {
    onUpdate({ ...update, phase: "verifying" });
    const usageReceipt = await fetchReceipt(update.requestId, update.leg);
    if (!usageReceipt) throw new Error(`provider issued no receipt for ${update.leg} request ${update.requestId}`);
    if (!verifyReceipt(usageReceipt, providerPublicKey)) {
      throw new Error(`receipt signature INVALID for ${update.leg} request ${update.requestId} — not paying`);
    }
    onUpdate({ ...update, phase: "settling", usageReceipt, receiptVerified: true });
    const settlement = await settleLeg(update.requestId, usageReceipt.modality, usageReceipt.units);
    const done: VoiceLegUpdate = {
      ...update,
      phase: settlement.status === "settled" || settlement.status === "pending" ? "done" : "failed",
      usageReceipt,
      receiptVerified: true,
      settlement,
    };
    onUpdate(done);
    return done;
  }

  function newLeg(voiceId: string, leg: Modality): VoiceLegUpdate {
    return { v: PROTOCOL_VERSION, voiceId, requestId: randomUUID(), leg, phase: "running" };
  }

  /** Leg 1: delegated Whisper transcription over the raw channel. */
  async function runStt(voiceId: string, audioF32le: Buffer): Promise<VoiceLegUpdate> {
    const leg = newLeg(voiceId, "stt");
    await assertAlive(leg);
    let transcript = "";
    for await (const frame of channel.stream({
      type: "transcribe", modelId: models.asrModelId, requestId: leg.requestId,
      audioChunk: { type: "base64", value: audioF32le.toString("base64") },
    })) {
      if (typeof frame.text === "string") transcript += frame.text;
      if (frame.done) break;
    }
    return attestAndSettle({ ...leg, text: transcript.trim() });
  }

  /** Leg 2: delegated LLM completion via the SDK. Streams tokens to the UI. */
  async function runLlm(voiceId: string, transcript: string): Promise<VoiceLegUpdate> {
    const leg = newLeg(voiceId, "llm");
    await assertAlive(leg);
    let reply = "";
    const history: Message[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: transcript },
    ];
    const stats = await llm.run(history, (token) => {
      reply += token;
      onUpdate({ ...leg, phase: "running", text: reply });
    });
    return attestAndSettle({ ...leg, requestId: stats.requestId, text: reply.trim() });
  }

  /** Leg 3: delegated Supertonic TTS over the raw channel. Returns PCM too. */
  async function runTts(voiceId: string, text: string): Promise<{ leg: VoiceLegUpdate; pcm: Buffer }> {
    const leg = newLeg(voiceId, "tts");
    await assertAlive(leg);
    const samples: number[] = [];
    for await (const frame of channel.stream({
      type: "textToSpeech", modelId: models.ttsModelId, requestId: leg.requestId,
      text, inputType: "text", stream: false, sentenceStream: false,
    })) {
      if (Array.isArray(frame.buffer)) for (const v of frame.buffer as number[]) samples.push(v);
      if (frame.done) break;
    }
    return { leg: await attestAndSettle(leg), pcm: f32SamplesToPcm16(samples) };
  }

  /** Run the full stt → llm → tts pipeline for one f32le voice note. */
  async function run(audioF32le: Buffer): Promise<VoicePipelineResult> {
    const voiceId = randomUUID();
    const sttLeg = await runStt(voiceId, audioF32le);
    const transcript = sttLeg.text ?? "";
    const llmLeg = await runLlm(voiceId, transcript);
    const reply = llmLeg.text ?? "";
    const { leg: ttsLeg, pcm: replyPcm } = await runTts(voiceId, reply);
    return { voiceId, transcript, reply, replyPcm, legs: [sttLeg, llmLeg, ttsLeg] };
  }

  return { run };
}

function f32SamplesToPcm16(samples: number[]): Buffer {
  const pcm = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  return pcm;
}
