# Day-0 Spike Findings (de-risk report)

Run on macOS (darwin 24.6.0), Node 25, `@qvac/sdk@0.13.5`, single machine.

## What works (verified live)

| Claim | Status | Evidence |
|---|---|---|
| `@qvac/sdk` installs + runs on Node here | ✅ | 172 pkgs; Bare worker boots, IPC connects |
| Model distribution over P2P (the registry) | ✅ | Pulled `Llama-3.2-1B-Instruct-Q4_0.gguf` (773 MB) from `registry://` over hyperdrive, validated checksum |
| Seller hosts + serves the model | ✅ | `startQVACProvider()` → publicKey `310ba1f2…`; llama.cpp loaded model, `loadModel` completed in 32s, registered for delegation |
| Buyer initiates delegated inference | ✅ | `loadModel({delegate})` sent delegated request, DHT bootstrapped, found provider key, **peer connection opened** |
| Meter field exists | ✅ | `completionStatsSchema` has `generatedTokens` + `promptTokens` (zod, in SDK) |

## ✅ RESOLVED, full round-trip works on one machine (via blind relay)

After standing up a local blind relay (`packages/relay/relay.ts`) and wiring both peers'
`swarmRelays` through `qvac.config.js` (`QVAC_CONFIG_PATH`), the delegated round-trip
completes end-to-end:

```
📨 remote tokens: Peer-to-peer (P2P) compute refers to a type of distributed computing
   where multiple computers, or peers, work together to process and share tasks, often
   without a centralized authority or intermediary.
tokens streamed from remote : YES
generatedTokens (the meter) : 39      ← the money meter is populated
promptTokens                : 46
buyer bytes during loadModel: 773.03 MB
```

**Two fixes were required beyond the relay:**
1. **Force CPU.** GGUF default is `device:"gpu", gpu_layers:99`; on this Intel Mac that
   yields garbage logits (` rust@@@@@…`). Pass `modelConfig:{ device:"cpu", gpu_layers:0 }`.
2. **Raise context.** Default `ctx_size:1024` is tight; use `ctx_size:4096` so the chat
   template + answer fit. (Set via `loadModel({ modelConfig })`, propagates to the provider.)

**Bandwidth question, answer is CONFOUNDED on one machine.** `onProgress` reported the full
773 MB, but the consumer shares `~/.qvac` with the provider, so this may be cached-file
progress, not a network download. Can't distinguish without a separate `cacheDirectory` per
peer. **Decision: narrate the conservative "buyer offloads the COMPUTE" framing** (valid in all
cases); the 1B-Q4 keeps it honest. Revisit with split cache dirs if we want the stronger claim.

## The original blocker (now worked around, kept for context)

**Same-host peer data connection times out (`ETIMEDOUT`)** after the connection opens:

```
🍺 Peer connection opened: 310ba1f2…
🔗 Establishing direct DHT connection … (0 swarm relay(s) configured)
DHT not bootstrapped within 5000ms before delegated connect; attempting anyway
Connection error for peer 310ba1f2…: Error: connection timed out {code:'ETIMEDOUT'}
```

**Cause:** hairpin NAT. Both peers sit behind one router/public IP; hyperdht holepunch can't route a peer back to its own public IP on most home routers. This is a single-network dev artifact, **not** how the product runs.

**Two real fixes (the demo decision):**
1. **Two devices on different networks**, the intended "two consumer devices" topology. Standard hyperdht holepunching works; no relay needed. Cleanest + most honest demo.
2. **Blind relay**, run/point both peers at a Hyperswarm blind relay via `QVAC_CONFIG_PATH` → `swarmRelays:[<relayPubKey>]`. Lets the whole demo run on one machine. `blind-relay` pkg is installed; needs a real relay keypair + verification that QVAC routes the delegated connect through it.

## Verified real API (use these exact shapes, they differ slightly from the prose docs)

```js
// SELLER (provider), does NOT pre-load a model; consumer names the modelSrc.
import { startQVACProvider, downloadAsset, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";
await downloadAsset({ assetSrc: LLAMA_3_2_1B_INST_Q4_0, seed: true, onProgress });
const { publicKey } = await startQVACProvider({ firewall }); // firewall optional

// BUYER (consumer)
import { completion, loadModel, close, LLAMA_3_2_1B_INST_Q4_0 } from "@qvac/sdk";
const modelId = await loadModel({
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  delegate: { providerPublicKey, timeout: 60_000, fallbackToLocal: false },
  onProgress: (p) => p.downloaded, // {downloaded,total,percentage}
});
const run = completion({ modelId, history:[{role:"user",content:"…"}], stream:true });
for await (const tok of run.tokenStream) process.stdout.write(tok); // NOT `response` directly
const stats = await run.stats; // {generatedTokens, promptTokens, ...}, NOT `.final.stats`
```

- Delegate options are ONLY: `providerPublicKey, timeout, healthCheckTimeout, fallbackToLocal, forceNewConnection`. **No per-call relay**, relays are global via `QVAC_CONFIG_PATH`/`swarmRelays`.
- Set identity with env `QVAC_HYPERSWARM_SEED` (64-hex) before `startQVACProvider`.

## Registry gotcha (cost us 15 min, documented so it never recurs)

Global npm registry is the mirror `registry.npmmirror.com`, which has **not** synced several `@qvac/*` and `@tetherto/*` scoped sub-packages (they show zero versions). Install QVAC/WDK with `--registry=https://registry.npmjs.org` (a clean `node_modules` + that flag works; mixing registries produces broken tarball URLs).

## "Buyer downloads weights?", still open

Couldn't measure: the connection didn't complete, and on one machine both peers share `~/.qvac` cache so `onProgress` bytes would read ~0 regardless. Resolve once a real connection lands (two devices, or separate `cacheDirectory` per peer). Mitigation stands: 1B-Q4 keeps the "buyer offloads compute" claim valid in the worst case.
