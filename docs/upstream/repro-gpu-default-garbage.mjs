/**
 * Minimal repro — GGUF completion emits garbage logits under the default
 * device config on a machine without a usable GPU offload.
 *
 * Observed with @qvac/sdk@0.13.5 on an Intel MacBook (macOS 14, no discrete GPU).
 *
 *   node docs/upstream/repro-gpu-default-garbage.mjs
 *
 * Expected: a coherent one-sentence answer.
 * Actual (default config): a stream of non-language tokens, e.g.
 *   " rust@@@@@@@@@@ @@@@ ..." — the model loads and runs, but the output is
 *   garbage because it is offloaded to a GPU backend that cannot actually
 *   execute it, and no error is raised.
 *
 * Setting modelConfig.device = "cpu" (gpu_layers: 0) fixes it (see FIX below).
 */
import { completion, loadModel, close, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

const FORCE_CPU = process.env.FORCE_CPU === "1";

const modelId = await loadModel({
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  // Default (no device set) reproduces the bug on non-GPU hosts.
  // FIX: modelConfig: { device: "cpu", gpu_layers: 0 }
  modelConfig: FORCE_CPU ? { ctx_size: 2048, device: "cpu", gpu_layers: 0 } : { ctx_size: 2048 },
  onProgress: (p) => process.stdout.write(`\rloading ${p.percentage.toFixed(0)}%`),
});
console.log(`\nloaded ${modelId} (FORCE_CPU=${FORCE_CPU})`);

const run = completion({
  modelId,
  history: [{ role: "user", content: "In one sentence, what is peer-to-peer compute?" }],
  stream: true,
});

let out = "";
for await (const tok of run.tokenStream) { out += tok; process.stdout.write(tok); }
const stats = (await run.stats) ?? {};

// Crude garbage detector: coherent English answers are mostly letters/spaces.
const letters = (out.match(/[a-zA-Z ]/g) ?? []).length;
const ratio = out.length ? letters / out.length : 0;
console.log(`\n\nbackendDevice: ${stats.backendDevice} · letter-ratio: ${ratio.toFixed(2)}`);
console.log(ratio < 0.6 ? "→ GARBAGE OUTPUT (bug reproduced)" : "→ coherent output");

void close();
