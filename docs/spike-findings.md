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

---

# Phase-2 Spike Findings (2026-07-10)

Same rig as Day 0: macOS (darwin 24.6.0), Node 25, `@qvac/sdk@0.13.5`, single machine, blind relay.

## Spike A: delegated `transcribe` + `textToSpeech`: ✅ YES, via a protocol-level extension

**The SDK's public client cannot delegate these calls.** In 0.13.5 the consumer-side RPC
registry (`dist/server/rpc/handler-registry.js`) wires `delegatedHandler`s for only five
request types: `loadModel`, `completionStream`, `heartbeat`, `unloadModel`, `cancel`.
Calling `transcribe`/`textToSpeech` on a delegated modelId throws
`Model "…" is a delegated model and cannot be accessed directly`.

**But the provider serves them anyway.** `startQVACProvider`'s inbound connection handler
(`provideHandler/proxy.js`) proxies *every* request type generically through
`handleRequest`, dispatching to local plugin handlers. The gap is purely consumer-side
routing, so we close it ourselves by speaking the SDK's own wire protocol:

- `hyperdht` connect to the provider public key (same relay, same firewall path),
- `bare-rpc` over the connection (works fine under Node; pure JS),
- zod-validated JSON frames, built with the SDK's own `loadModelOptionsToRequestSchema`,
- streaming replies arrive as NDJSON on `req.createResponseStream()`.

Verified live (`packages/buyer/spike2-raw-rpc.ts` against `packages/seller/spike2-provider.ts`):

```
remote loadModel whisper-tiny  → {"success":true,"modelId":"727845ffedb0ae5f"}
raw delegated transcript       → "would as peer to peer compute as a briefly."
stt stats                      → audioDuration: 2597ms, totalTokens: 11   ← per-audio-second meter
remote loadModel supertonic    → b2bba0a2bc01ebce
raw delegated textToSpeech     → 161,798 samples (3.67s audio), stats.audioDuration present
```

**Decisions:**
- Voice pipeline legs run over this raw channel; LLM completions keep using the SDK's
  built-in `loadModel({delegate})` + `completion` (fully supported there).
- Whisper input must be raw **f32le 16kHz mono** matching the model's `audio_format`
  (`{type:"base64"}` audioChunk); WAV headers make byte counts non-multiple-of-4.
- Upstream issue candidates found on the way:
  1. (Known, Day-0) GGUF GPU default produces garbage logits on non-GPU hosts.
  2. A malformed `transcribe` audio buffer (length % 4 ≠ 0) **permanently poisons the
     whisper processing queue**: every subsequent request on that model fails with the
     same error until the provider restarts. Repro is trivial; candidate for the filing.
  3. Missing consumer-side `delegatedHandler`s for `transcribe`/`textToSpeech`/`pluginInvoke`
     (this spike's whole raison d'être; worth reporting as a gap/feature request).

## Spike B: custom `definePlugin` in the provider runtime: ✅ YES, via bundleSdk

Custom plugins can't be injected at runtime from the Node host (the `plugins()` factory
registers into the host process, not the worker). The supported path is a **custom worker
bundle**: `bundleSdk({configPath})` from `@qvac/sdk/commands` reads a config whose
`plugins` array mixes builtin specifiers with custom module paths ending in `/plugin`,
generates `qvac/worker.entry.mjs`, and the host picks it up via `QVAC_WORKER_PATH`
(per-process: the seller runs the custom worker, the buyer keeps the default).

Verified live (`packages/seller/spike-metering-plugin/` + `packages/buyer/spike2-plugin-invoke.ts`):

```
remote loadModel {modelType:"infermart-metering"} → {"success":true,"modelId":"2b5ee3b0f0f0946b"}
remote pluginInvoke echo                          → {"nonce":"…","countedAt":1,"runtime":"bare"}
```

`runtime:"bare"` confirms the handler executed inside the provider's Bare worker.
Gotchas that cost time, so they never recur:
- plugin `addonPackage` must be a non-empty string even if no native addon is used;
- custom specifier resolves relative to `qvac/worker.entry.mjs` → use
  `../packages/seller/<name>/plugin` and put code in `plugin/index.js`;
- remote consumers reach the plugin via raw-channel `pluginInvoke` (the SDK client's
  `invokePlugin` has no delegated route, the same consumer-side gap as Spike A).

**Decision:** the signed-receipt metering plugin is real and provider-side (no wrapper
fallback needed). It registers in the seller's worker via the custom bundle; the buyer
fetches signed receipts over the raw channel.
