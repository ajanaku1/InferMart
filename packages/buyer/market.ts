/**
 * Buyer market view — live catalog from the QVAC model registry + provider
 * heartbeat. Replaces the Phase-1 hardcoded model constant on the buyer side:
 * the catalog is queried from `modelRegistrySearch` at runtime.
 */
import { heartbeat, modelRegistrySearch } from "@qvac/sdk";
import type { CatalogEntry } from "@infermart/shared/protocol";

// The exact registry model instances the seller hosts (matched by modelId).
const HOSTED = new Set(["Llama-3.2-1B-Instruct-Q4_0.gguf", "ggml-tiny.bin", "supertonic-q8_0.gguf"]);

/** QVAC registry entries carry an `addon` engine tag; map it to our modality. */
function modalityOf(addon?: string): CatalogEntry["modality"] {
  switch (addon) {
    case "whisper":
    case "parakeet":
      return "stt";
    case "tts":
      return "tts";
    case "llm":
      return "llm";
    default:
      return "other";
  }
}

interface RegistryEntry {
  modelId?: string;
  registryPath?: string;
  registrySource?: string;
  addon?: string;
}

/** Query the live registry for the models relevant to the voice pipeline. */
export async function fetchCatalog(): Promise<CatalogEntry[]> {
  const queries = ["llama", "whisper", "supertonic"];
  const seen = new Map<string, CatalogEntry>();
  for (const q of queries) {
    const results = (await modelRegistrySearch({ filter: q })) as RegistryEntry[];
    for (const entry of results) {
      const id = entry.modelId ?? entry.registryPath;
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        name: id,
        src: `${entry.registrySource ?? "registry"}://${entry.registryPath ?? id}`,
        modality: modalityOf(entry.addon),
        hosted: HOSTED.has(id),
      });
    }
  }
  // Hosted models first, then a modest tail of alternatives.
  const all = [...seen.values()].sort((a, b) => Number(b.hosted) - Number(a.hosted));
  return all.slice(0, 24);
}

export interface HeartbeatSample {
  alive: boolean;
  latencyMs?: number;
  error?: string;
}

/** One heartbeat round-trip to the provider. Never throws. */
export async function pingProvider(providerPublicKey: string, timeoutMs = 5000): Promise<HeartbeatSample> {
  const t0 = Date.now();
  try {
    await heartbeat({ delegate: { providerPublicKey, timeout: timeoutMs } });
    return { alive: true, latencyMs: Date.now() - t0 };
  } catch (err) {
    return { alive: false, error: err instanceof Error ? err.message : String(err) };
  }
}
