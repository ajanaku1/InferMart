/**
 * Buyer peer process — Phase 2.
 *
 * Boot flow: sign an access claim binding our Hyperswarm key to our wallet
 * address → submit to the seller's lobby → send the USDT deposit → wait for
 * the firewall to admit us (heartbeat) → connect all three modalities.
 *
 * Serves the dashboard with: text chat (Phase 1), the voice pipeline
 * (stt → llm → tts, each leg receipt-verified and settled), the live registry
 * catalog, and heartbeat latency. Never pays without a verified
 * provider-signed receipt; never pays when the heartbeat fails.
 */
import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import DHT from "hyperdht";
import { loadDotenv } from "@infermart/shared/env";
import { createDashboardServer } from "@infermart/shared/dashboard-server";
import { settlementConfigFromEnv } from "@infermart/shared/wdk";
import { audit } from "@infermart/shared/audit";
import { modalityPricesFromEnv } from "@infermart/shared/metering";
import { openDelegatedChannel } from "@infermart/shared/delegated-rpc";
import type { Message, VoiceLegUpdate } from "@infermart/shared/protocol";
import { signAccessClaim } from "../seller/gatekeeper.ts";
import { connectToProvider } from "./client.ts";
import { createSettler } from "./wallet.ts";
import { createVoicePipeline, loadVoiceModels } from "./voice.ts";
import { fetchCatalog, pingProvider } from "./market.ts";

await loadDotenv();
process.env.QVAC_CONFIG_PATH ??= join(process.cwd(), "qvac.config.js");

// Persistent buyer identity. The SDK's delegation and our raw channel each open
// their OWN hyperdht connection to the provider, and hyperdht rejects a second
// connection from the same keypair ("Duplicate connection") — so they need
// distinct identities. One deposit still admits both: the access claim, signed
// by the primary (SDK) key, authorizes the raw-channel key as a companion.
// (Both must differ from the seller's seed or holepunch self-connects.)
const buyerSeed = await loadOrCreateBuyerSeed();
process.env.QVAC_HYPERSWARM_SEED = buyerSeed.toString("hex");
const buyerSwarmKey = DHT.keyPair(buyerSeed).publicKey.toString("hex");
// Deterministic second identity for the raw channel: hash of the primary seed.
const rawSeed = createHash("sha256").update(buyerSeed).update("infermart-raw-channel").digest();
const rawChannelKey = DHT.keyPair(rawSeed).publicKey.toString("hex");

async function loadOrCreateBuyerSeed(): Promise<Buffer> {
  if (process.env.BUYER_QVAC_SEED) return Buffer.from(process.env.BUYER_QVAC_SEED, "hex");
  const file = ".spike/buyer-seed.hex";
  try {
    return Buffer.from((await readFile(file, "utf8")).trim(), "hex");
  } catch {
    const seed = randomBytes(32);
    await mkdir(".spike", { recursive: true });
    await writeFile(file, seed.toString("hex"), "utf8");
    return seed;
  }
}

const port = Number(process.env.BUYER_DASHBOARD_PORT ?? 4801);
const dash = createDashboardServer(port, join(import.meta.dirname, "web"));
dash.start();

const sessionCap = Number(process.env.SESSION_SPEND_CAP_BASEUNITS ?? 1_000_000);
const pricePer1k = Number(process.env.PRICE_PER_1K_TOKENS_BASEUNITS ?? 1000);
const prices = modalityPricesFromEnv();
const sellerLobbyUrl = process.env.SELLER_LOBBY_URL ?? "http://localhost:4802";
const relayKeys = process.env.RELAY_PUBLIC_KEY ? [process.env.RELAY_PUBLIC_KEY] : [];

async function providerKey(): Promise<string> {
  return (process.env.SELLER_PROVIDER_PUBLIC_KEY || (await readFile(".spike/provider-key.txt", "utf8"))).trim();
}

console.log("🛒 InferMart buyer starting...");
dash.broadcast("status", { phase: "connecting", port, capBaseUnits: sessionCap, pricePer1k, buyerSwarmKey });

const cfg = settlementConfigFromEnv();
const settler = await createSettler(process.env.BUYER_WALLET_MNEMONIC!, cfg, {
  pricePer1kBaseUnits: pricePer1k,
  sessionCapBaseUnits: sessionCap,
  sellerUsdtAddress: process.env.SELLER_USDT_ADDRESS!,
  prices,
});
const provider = await providerKey();

// ── Deposit gate: claim → deposit → wait for the firewall to open ──
await passDepositGate();

async function passDepositGate(): Promise<void> {
  if ((await pingProvider(provider, 4000)).alive) {
    dash.broadcast("gate", { phase: "admitted", swarmKey: buyerSwarmKey, detail: "already admitted" });
    return;
  }
  const claim = signAccessClaim(
    { swarmKey: buyerSwarmKey, senderAddress: settler.address, companionKeys: [rawChannelKey] },
    DHT.keyPair(buyerSeed).secretKey,
  );
  const lobby = await fetch(`${sellerLobbyUrl}/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(claim),
  }).then((r) => r.json() as Promise<{ minDepositBaseUnits?: number; error?: string }>);
  if (lobby.error) throw new Error(`lobby rejected claim: ${lobby.error}`);
  dash.broadcast("gate", { phase: "claim-submitted", swarmKey: buyerSwarmKey, senderAddress: settler.address });

  const amount = lobby.minDepositBaseUnits ?? 500_000;
  console.log(`💰 sending firewall deposit: ${amount} base-units USDT`);
  const txHash = await settler.deposit(amount);
  dash.broadcast("gate", { phase: "deposit-sent", txHash, detail: `${amount} base-units` });
  void audit({ type: "gate_deposit", role: "buyer", txHash, amountBaseUnits: amount });

  dash.broadcast("gate", { phase: "waiting-confirmations", txHash });
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    if ((await pingProvider(provider, 4000)).alive) {
      dash.broadcast("gate", { phase: "admitted", swarmKey: buyerSwarmKey, txHash });
      console.log("✅ firewall opened — deposit confirmed on-chain");
      return;
    }
  }
  throw new Error("deposit sent but firewall never opened (check seller logs)");
}

// ── Connect all three modalities ──
const client = await connectToProvider(provider);
console.log(`✅ LLM delegation ready; model ${client.modelId}`);
const channel = await openDelegatedChannel({ providerPublicKey: provider, relayKeys, seed: rawSeed });
const voiceModels = await loadVoiceModels(channel);
console.log(`✅ voice models ready (asr ${voiceModels.asrModelId}, tts ${voiceModels.ttsModelId})`);
void audit({ type: "model_load", role: "buyer", models: voiceModels, device: "delegated" });

const pipeline = createVoicePipeline(
  {
    channel,
    llm: client,
    providerPublicKey: provider,
    settleLeg: async (requestId, modality, units) => {
      const receipt = await settler.settleLeg(requestId, modality, units);
      dash.broadcast("receipt", receipt);
      emitSpend();
      void audit({ type: "settlement", role: "buyer", requestId, modality, units, amountBaseUnits: receipt.amountBaseUnits, status: receipt.status, txHash: receipt.txHash });
      if (receipt.status === "settled") void notifySeller(receipt);
      return receipt;
    },
    onUpdate: (update: VoiceLegUpdate) => dash.broadcast("voice", update),
  },
  voiceModels,
);

dash.broadcast("status", { phase: "ready", buyerAddress: settler.address, capBaseUnits: sessionCap, pricePer1k, buyerSwarmKey });

function emitSpend(): void {
  dash.broadcast("spend", { spentBaseUnits: settler.spentBaseUnits, capBaseUnits: sessionCap });
}
emitSpend();

// ── Live market catalog (real registry) + heartbeat loop ──
void fetchCatalog()
  .then((catalog) => dash.broadcast("catalog", { entries: catalog }))
  .catch((err) => console.warn(`catalog fetch failed: ${err.message}`));

setInterval(() => {
  void pingProvider(provider).then((sample) => dash.broadcast("heartbeat", sample));
}, 10_000);

// ── Text chat (Phase 1) ──
dash.onPost("/ask", async (body) => {
  const prompt = String((body as { prompt?: string }).prompt ?? "").trim();
  if (!prompt) return { error: "empty prompt" };

  const alive = await pingProvider(provider, 4000);
  dash.broadcast("heartbeat", alive);
  if (!alive.alive) return { error: "provider heartbeat failed — request not sent, nothing charged" };

  const requestId = randomUUID();
  const history: Message[] = [{ role: "user", content: prompt }];
  dash.broadcast("request", { requestId, prompt });
  const stats = await client.run(history, (token) => dash.broadcast("chunk", { requestId, token }));
  dash.broadcast("done", { requestId, stats });
  void audit({ type: "inference", role: "buyer", requestId, prompt, promptTokens: stats.promptTokens, generatedTokens: stats.generatedTokens, timeToFirstToken: stats.timeToFirstToken, tokensPerSecond: stats.tokensPerSecond, backendDevice: stats.backendDevice });

  const receipt = await settler.settle(requestId, stats);
  dash.broadcast("receipt", receipt);
  emitSpend();
  void audit({ type: "settlement", role: "buyer", requestId, amountBaseUnits: receipt.amountBaseUnits, status: receipt.status, txHash: receipt.txHash });
  if (receipt.status === "settled") void notifySeller(receipt);
  return { requestId, status: receipt.status };
});

// ── Voice pipeline ──
dash.onPost("/voice", async (body) => {
  const { audioBase64, useSample } = body as { audioBase64?: string; useSample?: boolean };
  let audio: Buffer;
  if (useSample) {
    audio = await readFile(".spike/phase2/voice-note.f32le");
  } else if (audioBase64) {
    audio = await decodeToF32le(Buffer.from(audioBase64, "base64"));
  } else {
    return { error: "no audio provided" };
  }

  const result = await pipeline.run(audio);
  void audit({ type: "voice_pipeline", role: "buyer", voiceId: result.voiceId, transcript: result.transcript, reply: result.reply, legs: result.legs.length });
  dash.broadcast("voice", {
    v: 1, voiceId: result.voiceId, requestId: "", leg: "tts", phase: "done",
    text: result.reply,
  });
  return {
    voiceId: result.voiceId,
    transcript: result.transcript,
    reply: result.reply,
    replyWavBase64: pcm16ToWav(result.replyPcm, 44_100).toString("base64"),
  };
});

/** Any browser-recorded container → raw f32le 16kHz mono via ffmpeg. */
function decodeToF32le(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ff = spawn("ffmpeg", ["-i", "pipe:0", "-f", "f32le", "-ar", "16000", "-ac", "1", "pipe:1"]);
    const out: Buffer[] = [];
    ff.stdout.on("data", (c: Buffer) => out.push(c));
    ff.on("error", reject);
    ff.on("close", (code) => {
      const audio = Buffer.concat(out);
      // f32le frames are 4 bytes; trim any partial tail frame.
      const trimmed = audio.subarray(0, audio.length - (audio.length % 4));
      if (code === 0 && trimmed.length > 0) resolve(trimmed);
      else reject(new Error(`ffmpeg decode failed (exit ${code})`));
    });
    ff.stdin.end(input);
  });
}

function pcm16ToWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function notifySeller(receipt: unknown): Promise<void> {
  try {
    await fetch(`${sellerLobbyUrl}/receipt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(receipt),
    });
  } catch {
    // demo convenience channel — seller's earnings are confirmed on-chain regardless
  }
}

process.on("SIGINT", async () => {
  console.log("\n🛑 buyer stopped");
  await audit({ type: "model_unload", role: "buyer", modelId: client.modelId });
  await channel.close();
  settler.dispose();
  process.exit(0);
});
process.stdin.resume();
