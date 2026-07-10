/**
 * InferMart metering plugin — runs INSIDE the seller's QVAC Bare worker.
 *
 * Two jobs:
 * 1. Meter: wraps the builtin whisper/tts/llm plugin handlers in the worker's
 *    plugin registry and records billable units per requestId as requests are
 *    served (audio ms transcribed, characters synthesized, tokens generated).
 * 2. Attest: exposes a `getReceipt` handler that signs the recorded usage with
 *    the provider's Hyperswarm identity (derived from QVAC_HYPERSWARM_SEED) —
 *    the same key the buyer dialed, so the receipt is verifiable with no PKI.
 *
 * Bundled by bare-pack via packages/seller/qvac.provider.config.json — plain JS
 * only (no TypeScript in the worker). Receipt format is TDD'd in
 * tests/receipts.test.ts via the shared signing core.
 */
import { z } from "zod";
import crypto from "hypercore-crypto";
// Bare has no global `process`; this resolves inside the worker bundle only.
import process from "bare-process";
import { definePlugin, defineHandler } from "@qvac/sdk/plugin-utils";
import { getPlugin } from "@qvac/sdk/plugins";
import { signReceipt } from "../../../shared/receipt-signing.js";

/** requestId → { modality, modelId, units, unitKind } — for handlers that carry a requestId. */
const usage = new Map();

/**
 * FIFO of TTS usages. The QVAC `textToSpeech` request schema has no requestId
 * field (it is stripped on the wire), so TTS usage can't be keyed by request.
 * The pipeline is sequential per connection, so the buyer claims the oldest
 * pending TTS usage by modality when it fetches the receipt.
 */
const ttsQueue = [];

function record(requestId, entry) {
  if (entry.modality === "tts") {
    ttsQueue.push(entry);
    return;
  }
  if (typeof requestId === "string" && requestId.length > 0) usage.set(requestId, entry);
}

/** Wrap a streaming plugin handler; `onFrame` inspects every yielded frame. */
function wrapStreamingHandler(handlerDef, onFrame) {
  const original = handlerDef.handler;
  handlerDef.handler = async function* (request, inputStream) {
    for await (const frame of original(request, inputStream)) {
      onFrame(request, frame);
      yield frame;
    }
  };
}

function installMeters() {
  const whisper = getPlugin("whispercpp-transcription");
  if (whisper?.handlers?.transcribe) {
    wrapStreamingHandler(whisper.handlers.transcribe, (request, frame) => {
      if (!frame.done) return;
      record(request.requestId, {
        modality: "stt",
        modelId: request.modelId,
        units: Math.ceil(frame.stats?.audioDuration ?? 0),
        unitKind: "audioMs",
      });
    });
  }

  const tts = getPlugin("tts-ggml");
  if (tts?.handlers?.textToSpeech) {
    wrapStreamingHandler(tts.handlers.textToSpeech, (request, frame) => {
      if (!frame.done) return;
      record(request.requestId, {
        modality: "tts",
        modelId: request.modelId,
        units: typeof request.text === "string" ? request.text.length : 0,
        unitKind: "chars",
      });
    });
  }

  const llm = getPlugin("llamacpp-completion");
  if (llm?.handlers?.completionStream) {
    wrapStreamingHandler(llm.handlers.completionStream, (request, frame) => {
      for (const event of frame.events ?? []) {
        if (event.type !== "completionStats") continue;
        record(request.requestId, {
          modality: "llm",
          modelId: request.modelId,
          units: event.stats?.generatedTokens ?? 0,
          unitKind: "tokens",
        });
      }
    });
  }
}

// The generated worker entry imports all plugin modules first, then registers
// them synchronously — so a microtask scheduled at import time runs after every
// builtin is registered and before any RPC request is served.
queueMicrotask(installMeters);

function providerKeyPair() {
  const seedHex = process.env.QVAC_HYPERSWARM_SEED;
  if (!seedHex) throw new Error("QVAC_HYPERSWARM_SEED not set — cannot sign receipts");
  return crypto.keyPair(Buffer.from(seedHex, "hex"));
}

const getReceiptRequestSchema = z.object({
  modelId: z.string(),
  requestId: z.string(),
  // "tts" claims the oldest queued TTS usage; otherwise looked up by requestId.
  modality: z.string().optional(),
});

const getReceiptResponseSchema = z.object({
  receipt: z
    .object({
      v: z.literal(1),
      requestId: z.string(),
      modality: z.string(),
      modelId: z.string(),
      units: z.number(),
      unitKind: z.string(),
      provider: z.string(),
      issuedAt: z.number(),
      signature: z.string(),
    })
    .nullable(),
});

export default definePlugin({
  modelType: "infermart-metering",
  displayName: "InferMart signed-receipt metering",
  // No native addon — the schema requires a non-empty name; never resolved
  // because createModel below doesn't load one.
  addonPackage: "@infermart/metering-noop",
  loadConfigSchema: z.object({}).loose(),
  skipPrimaryModelPathValidation: true,
  createModel() {
    return { model: { async load() {} } };
  },
  handlers: {
    getReceipt: defineHandler({
      requestSchema: getReceiptRequestSchema,
      responseSchema: getReceiptResponseSchema,
      streaming: false,
      handler: async (request) => {
        const entry = request.modality === "tts" ? ttsQueue.shift() : usage.get(request.requestId);
        if (!entry) return { receipt: null };
        const keyPair = providerKeyPair();
        const receipt = signReceipt(
          {
            v: 1,
            requestId: request.requestId,
            modality: entry.modality,
            modelId: entry.modelId,
            units: entry.units,
            unitKind: entry.unitKind,
            provider: keyPair.publicKey.toString("hex"),
            issuedAt: Date.now(),
          },
          keyPair.secretKey,
        );
        return { receipt };
      },
    }),
  },
});
