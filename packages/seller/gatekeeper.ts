/**
 * Deposit-gated firewall admission — the money path (TDD'd in tests/gatekeeper.test.ts).
 *
 * Flow: a fresh buyer signs an access claim binding its Hyperswarm key to the
 * EVM address it will pay from, and submits it over the seller's open "lobby"
 * channel. The gatekeeper watches the USDT contract; once transfers from that
 * address accumulate to the minimum deposit with enough confirmations, the
 * buyer's key is added to the QVAC firewall allowlist and the provider is
 * restarted — no out-of-band key exchange.
 *
 * This module holds the pure decision logic (fully unit-tested); the chain
 * polling and lobby wiring live with the seller process.
 */
import crypto from "hypercore-crypto";

/** Buyer → seller: "the deposit from `senderAddress` pays for `swarmKey`". */
export interface AccessClaim {
  swarmKey: string;
  senderAddress: string;
  /**
   * Extra Hyperswarm keys the same buyer uses (e.g. the raw-channel identity
   * alongside the SDK-delegation identity). Authorized by the same deposit and
   * covered by the primary key's signature.
   */
  companionKeys?: string[];
  /** Hex ed25519 signature by `swarmKey` over the canonical claim payload. */
  signature: string;
}

/** One USDT Transfer to the seller's address, as observed on-chain. */
export interface ObservedTransfer {
  from: string;
  amountBaseUnits: number;
  confirmations: number;
  txHash: string;
}

export interface GateConfig {
  minDepositBaseUnits: number;
  minConfirmations: number;
}

function claimPayload(swarmKey: string, senderAddress: string, companionKeys: string[]): Buffer {
  return Buffer.from(
    JSON.stringify(["infermart-access-claim", swarmKey, senderAddress.toLowerCase(), companionKeys]),
    "utf8",
  );
}

/** Sign a claim with the buyer's primary Hyperswarm secret key. */
export function signAccessClaim(
  claim: { swarmKey: string; senderAddress: string; companionKeys?: string[] },
  secretKey: Buffer,
): AccessClaim {
  const companionKeys = claim.companionKeys ?? [];
  const signature = crypto
    .sign(claimPayload(claim.swarmKey, claim.senderAddress, companionKeys), secretKey)
    .toString("hex");
  return { swarmKey: claim.swarmKey, senderAddress: claim.senderAddress, companionKeys, signature };
}

/** True only if the claim is signed by the primary swarm key it names. Never throws. */
export function verifyAccessClaim(claim: AccessClaim): boolean {
  try {
    return crypto.verify(
      claimPayload(claim.swarmKey, claim.senderAddress, claim.companionKeys ?? []),
      Buffer.from(claim.signature, "hex"),
      Buffer.from(claim.swarmKey, "hex"),
    );
  } catch {
    return false;
  }
}

/**
 * Which swarm keys have earned firewall admission: valid claim + confirmed
 * deposits from the claimed address accumulating to the minimum.
 */
export function decideAdmissions(
  claims: AccessClaim[],
  transfers: ObservedTransfer[],
  config: GateConfig,
): string[] {
  // Sum confirmed transfers per sender; overlapping polls can repeat a tx,
  // so each txHash counts once.
  const confirmedByAddress = new Map<string, number>();
  const seenTx = new Set<string>();
  for (const t of transfers) {
    if (t.confirmations < config.minConfirmations) continue;
    if (seenTx.has(t.txHash)) continue;
    seenTx.add(t.txHash);
    const addr = t.from.toLowerCase();
    confirmedByAddress.set(addr, (confirmedByAddress.get(addr) ?? 0) + t.amountBaseUnits);
  }

  // One deposit admits at most one key: the first valid claim per address
  // wins. (Binding the claim to an address signature is future work — the
  // limitation is disclosed in the README.)
  const admitted = new Set<string>();
  const claimedAddresses = new Set<string>();
  for (const claim of claims) {
    if (admitted.has(claim.swarmKey)) continue;
    if (!verifyAccessClaim(claim)) continue;
    const addr = claim.senderAddress.toLowerCase();
    if (claimedAddresses.has(addr)) continue;
    if ((confirmedByAddress.get(addr) ?? 0) >= config.minDepositBaseUnits) {
      admitted.add(claim.swarmKey);
      for (const companion of claim.companionKeys ?? []) admitted.add(companion);
      claimedAddresses.add(addr);
    }
  }
  return [...admitted];
}

// ── Chain watching (I/O; the decision logic above stays pure and tested) ──

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * USDT `Transfer(*, sellerAddress)` events via eth_getLogs, with confirmation
 * counts. Scans the last `lookbackBlocks` so a demo deposit sent before the
 * seller booted still counts.
 */
export async function fetchTransfersTo(
  sellerAddress: string,
  rpcUrl: string,
  usdtContract: string,
  lookbackBlocks = 5000,
): Promise<ObservedTransfer[]> {
  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json()) as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(`${method}: ${json.error.message}`);
    return json.result as T;
  }

  const latestHex = await rpc<string>("eth_blockNumber", []);
  const latest = Number.parseInt(latestHex, 16);
  const fromBlock = Math.max(0, latest - lookbackBlocks);
  const paddedTo = "0x" + sellerAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0");

  const logs = await rpc<Array<{ topics: string[]; data: string; blockNumber: string; transactionHash: string }>>(
    "eth_getLogs",
    [{
      address: usdtContract,
      fromBlock: "0x" + fromBlock.toString(16),
      toBlock: "latest",
      topics: [TRANSFER_TOPIC, null, paddedTo],
    }],
  );

  return logs.map((log) => ({
    from: "0x" + log.topics[1]!.slice(26),
    amountBaseUnits: Number(BigInt(log.data)),
    confirmations: latest - Number.parseInt(log.blockNumber, 16) + 1,
    txHash: log.transactionHash,
  }));
}
