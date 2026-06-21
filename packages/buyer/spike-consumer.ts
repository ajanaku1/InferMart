/**
 * Day-0 spike — BUYER side.
 * Reads the provider's public key, runs ONE delegated completion over Holepunch,
 * and records (a) that tokens stream from the remote provider, (b) that
 * generatedTokens is populated (the meter), and (c) how many bytes loadModel
 * pulled — the signal for "does the buyer download weights or just a descriptor?".
 */
import { readFile } from "node:fs/promises";
import { completion, loadModel, close, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

const providerPublicKey = (await readFile(".spike/provider-key.txt", "utf8")).trim();
console.log(`🛒 buyer: delegating to provider ${providerPublicKey.slice(0, 16)}…`);

let downloadedBytes = 0;
const t0 = Date.now();
const modelId = await loadModel({
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  // Force CPU: this is an Intel Mac with no usable GPU offload — the GGUF default
  // (device:"gpu", gpu_layers:99) yields garbage logits. ctx_size up from the 1024
  // default so the chat template + a real answer fit.
  modelConfig: { ctx_size: 4096, device: "cpu", gpu_layers: 0 },
  delegate: { providerPublicKey, timeout: 60_000, fallbackToLocal: false },
  onProgress: (p: { downloaded: number; total: number }) => {
    downloadedBytes = p.downloaded;
  },
});
const connectMs = Date.now() - t0;
console.log(`✅ buyer: delegated model registered (${modelId}) in ${connectMs}ms`);

const run = completion({
  modelId,
  history: [{ role: "user", content: "In one sentence, what is peer-to-peer compute?" }],
  stream: true,
});

process.stdout.write("📨 remote tokens: ");
let streamed = "";
for await (const token of run.tokenStream) {
  streamed += token;
  process.stdout.write(token);
}
const stats = (await run.stats) ?? {};

console.log("\n\n── SPIKE RESULT ─────────────────────────────");
console.log(`tokens streamed from remote : ${streamed.length > 0 ? "YES" : "NO"}`);
console.log(`generatedTokens (the meter) : ${stats.generatedTokens ?? "MISSING"}`);
console.log(`promptTokens                : ${stats.promptTokens ?? "MISSING"}`);
console.log(`buyer bytes during loadModel: ${downloadedBytes} (${(downloadedBytes / 1e6).toFixed(2)} MB)`);
console.log(`→ buyer downloaded ${downloadedBytes > 50_000_000 ? "WEIGHTS (use 'offloads compute' framing)" : "≈descriptor only (use 'phone with no model' framing)"}`);
console.log("─────────────────────────────────────────────");

void close();
