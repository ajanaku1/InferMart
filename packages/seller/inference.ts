/**
 * Seller QVAC provider — hosts the GGUF model and serves delegated inference.
 *
 * Seeds the model locally (so this node truly holds the weights), then opens a
 * delegated-inference provider over Holepunch. Identity is deterministic via
 * QVAC_HYPERSWARM_SEED so the public key is stable across restarts for the demo.
 */
import { startQVACProvider, downloadAsset, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";

export interface ProviderHandle {
  publicKey: string;
}

export interface ProviderOptions {
  allowedConsumerKey?: string;
  onSeedProgress?: (percentage: number) => void;
}

/** Seed the model, then start the provider. Returns the provider public key. */
export async function startProvider(opts: ProviderOptions = {}): Promise<ProviderHandle> {
  await downloadAsset({
    assetSrc: LLAMA_3_2_1B_INST_Q4_0,
    seed: true,
    onProgress: (p: { percentage: number }) => opts.onSeedProgress?.(p.percentage),
  });

  const { publicKey } = await startQVACProvider({
    firewall: opts.allowedConsumerKey
      ? { mode: "allow", publicKeys: [opts.allowedConsumerKey] }
      : undefined,
  });

  return { publicKey };
}
