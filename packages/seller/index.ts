/**
 * Seller peer process — Phase 2 parent/supervisor.
 *
 * Owns the dashboard, the deposit lobby, and the on-chain gate; delegates the
 * QVAC provider itself to a child process (provider-process.ts) so the firewall
 * allowlist can actually change: the QVAC firewall is fixed at swarm creation,
 * so admitting a newly-paid buyer means respawning the child with an updated
 * ALLOWED_KEYS. The provider public key is stable across respawns.
 *
 * Access is deposit-gated: buyers POST a signed access claim to /claim, the
 * gatekeeper watches USDT transfers on-chain, and confirmed depositors' keys
 * are admitted through the firewall automatically. Earnings truth = the
 * seller's own USDT balance polled on-chain.
 */
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { loadDotenv } from "@infermart/shared/env";
import { createDashboardServer } from "@infermart/shared/dashboard-server";
import { settlementConfigFromEnv } from "@infermart/shared/wdk";
import { audit } from "@infermart/shared/audit";
import type { SettlementReceipt } from "@infermart/shared/protocol";
import { HOSTED_MODELS } from "./inference.ts";
import { watchUsdtBalance } from "./settlement.ts";
import { decideAdmissions, verifyAccessClaim, fetchTransfersTo, type AccessClaim } from "./gatekeeper.ts";

await loadDotenv();
const __dirname = dirname(fileURLToPath(import.meta.url));

if (!existsSync(join(process.cwd(), "qvac", "worker.entry.mjs"))) {
  console.warn("⚠️  qvac/worker.entry.mjs missing — run `npm run bundle-worker` first; receipts will be unavailable");
}

const port = Number(process.env.SELLER_DASHBOARD_PORT ?? 4802);
const dash = createDashboardServer(port, join(__dirname, "web"));

let served = 0;
const receipts: SettlementReceipt[] = [];
dash.onPost("/receipt", (body) => {
  const r = body as SettlementReceipt;
  if (r.status === "settled") {
    served += 1;
    receipts.unshift(r);
    dash.broadcast("request", { receipt: r, served });
  }
  return { ok: true };
});

// ── Deposit gate: signed claims in, firewall admissions out ──
const gateConfig = {
  minDepositBaseUnits: Number(process.env.MIN_DEPOSIT_BASEUNITS ?? 500_000),
  minConfirmations: Number(process.env.MIN_CONFIRMATIONS ?? 1),
};
const claims: AccessClaim[] = [];
dash.onPost("/claim", (body) => {
  const claim = body as AccessClaim;
  if (!verifyAccessClaim(claim)) return { error: "invalid claim signature" };
  if (!claims.some((c) => c.swarmKey === claim.swarmKey)) {
    claims.push(claim);
    dash.broadcast("gate", { phase: "claim-submitted", swarmKey: claim.swarmKey, senderAddress: claim.senderAddress });
    console.log(`🔐 access claim: ${claim.swarmKey.slice(0, 16)}… pays from ${claim.senderAddress}`);
  }
  return {
    ok: true,
    sellerAddress: process.env.SELLER_USDT_ADDRESS,
    minDepositBaseUnits: gateConfig.minDepositBaseUnits,
    minConfirmations: gateConfig.minConfirmations,
  };
});

dash.start();
console.log("⛏️  InferMart seller starting...");
dash.broadcast("status", { phase: "seeding", chain: "sepolia", port });

// ── Provider child process (respawned on new admissions) ──
let admittedKeys: string[] = [];
let child: ChildProcess | undefined;
let providerPublicKey = "";

function spawnProvider(allowedKeys: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [join(__dirname, "provider-process.ts")], {
      env: { ...process.env, ALLOWED_KEYS: allowedKeys.join(",") },
      stdio: ["pipe", "pipe", "inherit"],
    });
    child = proc;
    let out = "";
    const timer = setTimeout(() => reject(new Error("provider child did not announce its key in time")), 180_000);
    proc.stdout!.on("data", (chunk: Buffer) => {
      const str = chunk.toString();
      out += str;
      process.stdout.write(`[provider] ${str}`);
      const match = out.match(/Provider Public Key: ([a-f0-9]+)/i);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]!);
      }
    });
    proc.on("exit", (code) => {
      if (!providerPublicKey) { clearTimeout(timer); reject(new Error(`provider child exited early (code ${code})`)); }
    });
  });
}

async function respawnProvider(allowedKeys: string[]): Promise<void> {
  if (child && !child.killed) {
    child.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 1500));
  }
  providerPublicKey = await spawnProvider(allowedKeys);
}

providerPublicKey = await spawnProvider(admittedKeys);
console.log(`✅ provider live (locked): ${providerPublicKey}`);
await mkdir(".spike", { recursive: true });
await writeFile(".spike/provider-key.txt", providerPublicKey, "utf8");
void audit({
  type: "model_load", role: "seller", providerPublicKey,
  models: HOSTED_MODELS.map((m) => m.name), action: "seed+serve (deposit-gated)",
});
dash.broadcast("status", {
  phase: "live",
  providerPublicKey,
  walletAddress: process.env.SELLER_USDT_ADDRESS,
  relayKey: process.env.RELAY_PUBLIC_KEY,
  hostedModels: HOSTED_MODELS.map((m) => ({ name: m.name, modality: m.modality })),
  minDepositBaseUnits: gateConfig.minDepositBaseUnits,
});
dash.broadcast("gate", { phase: "closed", detail: "firewall locked — deposit to enter" });

// Poll the chain; admit confirmed depositors by respawning the provider with
// the updated allowlist. The QVAC firewall becomes the escrow gate.
const cfg = settlementConfigFromEnv();
const sellerAddress = process.env.SELLER_USDT_ADDRESS;
let gateBusy = false;
async function gateTick(): Promise<void> {
  if (gateBusy) return;
  gateBusy = true;
  try {
    if (!sellerAddress || claims.length === 0) return;
    const transfers = await fetchTransfersTo(sellerAddress, cfg.rpcUrl, cfg.usdtContract);
    const admitted = decideAdmissions(claims, transfers, gateConfig);
    const fresh = admitted.filter((k) => !admittedKeys.includes(k));
    if (fresh.length === 0) return;
    admittedKeys = admitted;
    dash.broadcast("gate", { phase: "waiting-confirmations", detail: "restarting provider with new allowlist" });
    await respawnProvider(admittedKeys);
    await writeFile(".spike/provider-key.txt", providerPublicKey, "utf8");
    for (const key of fresh) {
      console.log(`✅ firewall opened for ${key.slice(0, 16)}… (deposit confirmed)`);
      dash.broadcast("gate", { phase: "admitted", swarmKey: key });
      void audit({ type: "firewall_admit", role: "seller", swarmKey: key });
    }
  } catch (err) {
    console.warn(`gate tick failed: ${err instanceof Error ? err.message : err}`);
  } finally {
    gateBusy = false;
  }
}
setInterval(() => void gateTick(), 5000);

// Real, on-chain earnings: poll the seller's USDT balance and report every move.
if (sellerAddress) {
  watchUsdtBalance(sellerAddress, cfg, ({ balanceBaseUnits, deltaBaseUnits }) => {
    dash.broadcast("balance", {
      balanceBaseUnits: balanceBaseUnits.toString(),
      deltaBaseUnits: deltaBaseUnits.toString(),
    });
  });
}

process.on("SIGINT", () => {
  console.log("\n🛑 seller stopped");
  child?.kill("SIGTERM");
  process.exit(0);
});
process.stdin.resume();
