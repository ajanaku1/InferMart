# Upstream issues — both FILED on tetherto/qvac

- **#3220** — https://github.com/tetherto/qvac/issues/3220 — GGUF completion returns garbage logits under default device config on hosts without a usable GPU (no error raised). *(this document)*
- **#3221** — https://github.com/tetherto/qvac/issues/3221 — Malformed f32le audio buffer permanently poisons the Whisper processing queue (later valid transcribe calls fail until restart).

---

**Title:** GGUF completion returns garbage logits under default device config on hosts without a usable GPU (no error raised)

---

## Summary

On a machine with no usable GPU offload (Intel MacBook, macOS 14, `@qvac/sdk@0.13.5`), `loadModel` + `completion` with the default `modelConfig` loads the model and streams tokens, but the tokens are non-language garbage, e.g. `" red@@@@@@@@@@ @@@@ …"`. Nothing throws and the run finishes with populated stats. Setting `modelConfig.device = "cpu"` (with `gpu_layers: 0`) fixes it on the same machine.

The silent part is what bit us. The caller gets no signal that the output is wrong. We only noticed because we bill per request, so garbage that looks like a successful run is worse for us than an outright error would have been.

## Environment

- `@qvac/sdk` 0.13.5
- Node.js 22+ (also seen on 25)
- macOS 14 (Darwin 24.6.0), Intel CPU, no discrete/usable GPU
- Model: `LLAMA_3_2_1B_INST_Q4_0` (registry)

## Steps to reproduce

```bash
# garbage (default device config)
node repro-gpu-default-garbage.mjs

# coherent (forced CPU)
FORCE_CPU=1 node repro-gpu-default-garbage.mjs
```

Repro script attached (`repro-gpu-default-garbage.mjs`). It prints a crude letter-ratio and flags garbage output automatically.

## Expected

Either a coherent completion, or — if the selected GPU backend can't actually execute the model — a raised error, so the caller knows the run failed rather than silently receiving corrupt tokens.

## Actual

`loadModel` picks the GGUF default (`device: "gpu"`, `gpu_layers: 99`) and the completion streams garbage logits. No error. `stats` is populated as if the run succeeded.

## Workaround

```js
await loadModel({
  modelSrc: LLAMA_3_2_1B_INST_Q4_0,
  modelConfig: { device: "cpu", gpu_layers: 0 },
});
```

## Suggested fixes

Any one of these would have saved us the debugging time:

1. If the GPU backend can't actually run the model, fall back to CPU with a warning instead of emitting corrupt output.
2. Run a backend sanity check at load and throw if it fails, so the caller gets an error instead of garbage tokens.
3. If neither is practical, document in `loadModel` that non-GPU hosts should pass `device: "cpu"` and that the GPU default can silently corrupt output.

## A smaller, separate finding

While extending delegation to `transcribe`, we hit a second issue. A malformed Whisper audio buffer (byte length not a multiple of 4 for `audio_format: "f32le"`) doesn't just fail that one request. It makes the model's processing queue reject *every* later request on the same instance with `"Failed to append data to processing queue, error: f32le buffer length must be a multiple of 4"`, until the provider restarts. Filed separately as **#3221** (https://github.com/tetherto/qvac/issues/3221).
