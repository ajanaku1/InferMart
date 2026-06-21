/**
 * Buyer QVAC client — delegated inference over Holepunch.
 *
 * Connects to the seller's provider once (cold DHT bootstrap is slow; we warm it on
 * boot), then streams completions per request. CPU + raised ctx are forced because the
 * GGUF GPU default produces garbage on non-GPU hosts (see docs/spike-findings.md).
 */
import { completion, loadModel, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";
import type { Message, MeterStats } from "@infermart/shared/protocol";

export interface InferenceClient {
  modelId: string;
  run(history: Message[], onToken: (t: string) => void): Promise<MeterStats>;
}

/**
 * Register the delegated model against the provider (slow first call — do at startup).
 * Relay-routed holepunch can fail transiently on the same host, so retry with backoff.
 */
export async function connectToProvider(providerPublicKey: string, attempts = 5): Promise<InferenceClient> {
  let modelId: string | undefined;
  for (let i = 1; i <= attempts; i++) {
    try {
      modelId = await loadModel({
        modelSrc: LLAMA_3_2_1B_INST_Q4_0,
        modelConfig: { ctx_size: 4096, device: "cpu", gpu_layers: 0 },
        delegate: { providerPublicKey, timeout: 60_000, fallbackToLocal: false },
      });
      break;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`   connect attempt ${i}/${attempts} failed (${(err as Error).message.slice(0, 60)}…); retrying in ${i * 3}s`);
      await new Promise((r) => setTimeout(r, i * 3000));
    }
  }

  const id = modelId!;
  async function run(history: Message[], onToken: (t: string) => void): Promise<MeterStats> {
    const completionRun = completion({ modelId: id, history, stream: true });
    for await (const token of completionRun.tokenStream) onToken(token);
    const stats = (await completionRun.stats) ?? {};
    return {
      generatedTokens: stats.generatedTokens ?? 0,
      promptTokens: stats.promptTokens ?? 0,
    };
  }

  return { modelId: id, run };
}
