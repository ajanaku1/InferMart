/**
 * Seller QVAC provider — hosts the GGUF LLM plus Whisper (STT) and Supertonic
 * (TTS), and serves all three as delegated inference over Holepunch.
 *
 * Phase 2: the provider runs a CUSTOM worker bundle (qvac/worker.entry.mjs,
 * generated from packages/seller/qvac.provider.config.json) that registers the
 * InferMart metering plugin next to the builtin plugins. Identity is
 * deterministic via QVAC_HYPERSWARM_SEED; the firewall allowlist is driven by
 * the deposit gatekeeper and applied with a provider restart.
 */
import { keyPair } from "hypercore-crypto";
import {
  startQVACProvider,
  downloadAsset,
  LLAMA_3_2_1B_INST_Q4_0,
  WHISPER_TINY,
  TTS_EN_SUPERTONIC_Q8_0,
} from "@qvac/sdk";

export const HOSTED_MODELS = [
  { name: "LLAMA_3_2_1B_INST_Q4_0", src: LLAMA_3_2_1B_INST_Q4_0, modality: "llm" as const },
  { name: "WHISPER_TINY", src: WHISPER_TINY, modality: "stt" as const },
  { name: "TTS_EN_SUPERTONIC_Q8_0", src: TTS_EN_SUPERTONIC_Q8_0, modality: "tts" as const },
];

export interface ProviderHandle {
  publicKey: string;
}

export interface ProviderOptions {
  /** Hyperswarm keys admitted through the firewall. Empty = locked (deny all others). */
  allowedKeys?: string[];
  onSeedProgress?: (model: string, percentage: number) => void;
}

/**
 * Firewall config for the allowlist. QVAC treats an EMPTY allowlist as "no
 * filtering", so a locked provider needs a non-empty list — we pin the
 * provider's own key (derived from the seed), which never dials itself, so the
 * net effect is "deny everyone until a deposit admits their key".
 *
 * NOTE: the firewall is fixed when the QVAC swarm is first created and cannot
 * be changed in-process (stopQVACProvider keeps the cached swarm; see
 * docs/spike-findings.md). Admitting a new key therefore requires restarting
 * this whole process — which the parent seller process does, respawning us with
 * an updated ALLOWED_KEYS. The provider public key is stable across restarts
 * because it is derived from QVAC_HYPERSWARM_SEED.
 */
function firewallFor(allowedKeys: string[]): { mode: "allow"; publicKeys: string[] } | undefined {
  const seed = process.env.QVAC_HYPERSWARM_SEED;
  const selfKey = seed ? keyPair(Buffer.from(seed, "hex")).publicKey.toString("hex") : undefined;
  const publicKeys = allowedKeys.length > 0 ? allowedKeys : selfKey ? [selfKey] : [];
  return publicKeys.length > 0 ? { mode: "allow", publicKeys } : undefined;
}

/** Seed all hosted models, then start the provider with the given allowlist. */
export async function startProvider(opts: ProviderOptions = {}): Promise<ProviderHandle> {
  for (const model of HOSTED_MODELS) {
    await downloadAsset({
      assetSrc: model.src,
      seed: true,
      onProgress: (p: { percentage: number }) => opts.onSeedProgress?.(model.name, p.percentage),
    });
  }

  const { publicKey } = await startQVACProvider({ firewall: firewallFor(opts.allowedKeys ?? []) });
  if (!publicKey) throw new Error("provider failed to start (no public key)");
  return { publicKey };
}
