# InferMart Architecture

The design contract every part of the system builds against.

## 1. Domain in one paragraph

InferMart is a **peer-to-peer marketplace for idle on-device AI inference**, settled in
real testnet USDT. A **seller** node hosts a GGUF model behind `@qvac/sdk` and advertises a
per-token price. A **buyer** node with *no local model* sends a prompt over a Holepunch P2P
link, receives a streamed completion executed on the seller's hardware, meters the work by
`generatedTokens`, and pays the seller in USDT via a Tether WDK wallet. No servers, no cloud,
no cluster, every node is a single consumer device.

## 2. Non-functional requirements (demo-first)

| Concern | Decision | Rationale |
|---|---|---|
| Latency | First delegated call cold-boots the DHT (15–45s); sub-second after. | Do one **warm-up call** before recording. |
| Scale | Exactly 2 peers for the MVP. | Out of scope: routing, multi-seller. |
| Consistency | Settlement is **post-paid, at-most-once per request**, keyed by request id. | Bug here = lost funds → this is the only TDD'd path. |
| Trust | Seller fronts the compute, then bills. Buyer caps spend per session. | Matches WDK policy-engine default-deny story. |
| Resilience | Inference must survive WAN loss (local/relay P2P link). | The "no cloud" demo beat. |

## 3. The two processes (service boundaries)

Both are **local Node processes** (the `@qvac/sdk` runs on Node/Bare, not the browser).
Each owns: a QVAC role, a WDK wallet, and a localhost web dashboard. The P2P link is
**process ↔ process** over Holepunch, never browser ↔ browser.

```
┌──────────────── BUYER DEVICE ────────────────┐         ┌──────────────── SELLER DEVICE ───────────────┐
│  Browser dashboard (localhost:4801)           │         │  Browser dashboard (localhost:4802)           │
│        │  HTTP + SSE (prompt in / tokens out)  │         │        ▲  HTTP + SSE (live meter / balance)    │
│        ▼                                       │         │        │                                       │
│  Buyer process (Node)                          │         │  Seller process (Node)                         │
│   ├─ client.ts   @qvac/sdk consumer            │ Holepunch│   ├─ inference.ts  @qvac/sdk provider          │
│   │   loadModel({ delegate.providerPublicKey })│◀════════▶│   │   startQVACProvider({ firewall })          │
│   │   completion({ stream:true })              │  (DHT/   │   │   → publicKey (the "address")              │
│   ├─ metering (shared)  generatedTokens→amount │  relay)  │   └─ settlement.ts  WDK: poll USDT balance     │
│   └─ wallet.ts   WDK: send USDT  ─────────────────────────────────▶ on-chain USDT transfer ───────────────▶
└────────────────────────────────────────────────┘         └────────────────────────────────────────────────┘
```

### Seller process, responsibilities
- Set deterministic identity: `QVAC_HYPERSWARM_SEED` (64-hex, from `.env`).
- `loadModel(localGGUF)` then `startQVACProvider({ firewall })` → print `publicKey`.
- Firewall (optional): `{ mode:"allow", publicKeys:[buyerConsumerKey] }` for the locked demo.
- Hold a WDK wallet; expose its **USDT receive address**.
- Dashboard: live request log, tokens metered, USDT balance (polled on-chain → real).

### Buyer process, responsibilities
- Read seller `providerPublicKey` + seller USDT address from `.env` (**hardcoded discovery**, in scope to mock).
- `loadModel({ modelSrc, delegate:{ providerPublicKey, timeout:60_000, fallbackToLocal:true } })`.
- `completion({ modelId, history, stream:true })`; stream chunks to dashboard via SSE.
- On `(await run.final).stats`: meter → compute amount → **enforce session spend cap** → WDK transfer → show tx hash.
- Dashboard: prompt box, streamed output, per-request cost, running session spend vs cap, tx hashes.

## 4. Discovery & settlement decisions (the two judgment calls)

**Discovery (mocked, allowed):** QVAC delegated connect is **direct by public key, no discovery
phase**. The seller prints its `providerPublicKey`; we paste it into the buyer's `.env`. This is
honest: the prompt explicitly scopes discovery as mockable.

**Settlement path (real, never mocked):** buyer pays **after** a successful completion, computed
from `generatedTokens` (same field the OpenAI-compat layer bills on). Flow:

1. Inference completes → buyer reads `final.stats.generatedTokens`.
2. `metering.priceFor(stats)` → integer USDT base-units (6 decimals).
3. Session guard: reject if `spent + amount > sessionCap` (policy-engine story).
4. WDK `account.sendTransaction({ to: sellerUsdtAddress, value })` (ERC-20/TRC-20 USDT transfer).
5. Buyer dashboard shows tx hash + explorer link; **seller dashboard polls its on-chain USDT
   balance** and shows it increment, both sides reflect the move from real chain state.

> Why poll balance instead of messaging a receipt? It keeps the money pillar honest: the seller
> believes the chain, not the buyer's word. One extra request id is carried in nothing on-chain;
> the buyer also surfaces the hash for the video. At-most-once is enforced buyer-side by request id.

## 5. P2P message contract (see `protocol.ts`)

QVAC owns the inference transport (request history + streamed chunks + `final.stats`). InferMart
adds a thin **app-level envelope** so the dashboards speak one vocabulary regardless of transport:

- `InferenceRequest` { requestId, prompt, history, createdAt }
- `StreamChunk` { requestId, seq, token, done }
- `SettlementReceipt` { requestId, generatedTokens, promptTokens, amountBaseUnits, txHash, chain, explorerUrl, status }

These are the SSE event payloads the dashboards render and the shape `metering` consumes.

## 6. Resilience / observability (right-sized for a 2-min demo)

- **Warm-up call** on seller+buyer boot to pre-bootstrap the DHT (kills the 15–45s cold start on camera).
- **Timeout + `fallbackToLocal:false`** on the buyer so a dead seller fails loud (we *want* to prove remote execution).
- **Structured request log** with a `requestId` correlation id on both dashboards.
- **Spend cap** is the safety rail; a failed/over-cap request never sends a tx.

## 7. Tech choices

- **Language:** TypeScript run via Node's native type-stripping (Node ≥ 22) → no build step, keeps the
  `.ts` source honest. Falls back to `.js` under Bare if stripping isn't available.
- **Dashboards:** plain HTML + inline CSS + SSE (`EventSource`). No framework, no bundler, opens instantly.
- **Chain:** resolved in the Day-1 settlement phase (Tron Shasta USDT or an EVM testnet USDT with an easy faucet).

## 8. Risks & the Day-0 spike (de-risk before anything else)

| Risk | Mitigation |
|---|---|
| QVAC DHT round-trip doesn't work on this machine | **Spike**: provider on one process, consumer on another, one real prompt→completion. |
| Buyer downloads model **weights** (breaks "phone with no model" framing) | **Spike measures consumer bandwidth** during `loadModel`; use a 1B-Q4 (~0.7GB) model so the claim holds either way. |
| Meter field empty | Spike asserts `final.stats.generatedTokens` is populated. |
| Testnet faucet / funding | Day-1 settlement task; not a Day-0 blocker. |

**Spike acceptance:** (1) tokens stream from the remote provider; (2) `generatedTokens` populated;
(3) consumer bandwidth during `loadModel` recorded → decides narration ("phone with no model" vs
"buyer offloads the compute").
