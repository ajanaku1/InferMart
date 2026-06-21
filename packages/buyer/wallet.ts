/**
 * Buyer settlement — turns a finished QVAC request into a real on-chain USDT transfer.
 *
 * Composes the TDD'd metering money-path with the WDK wallet: price the work, enforce
 * the session spend cap (never send over-cap), transfer USDT, return a SettlementReceipt
 * both dashboards render. At-most-once is keyed by requestId at the call site.
 */
import { evaluateSettlement } from "@infermart/shared/metering";
import type { MeterStats, SettlementReceipt } from "@infermart/shared/protocol";
import { PROTOCOL_VERSION } from "@infermart/shared/protocol";
import { signingAccount, type SettlementConfig } from "@infermart/shared/wdk";

export interface SettlerOptions {
  pricePer1kBaseUnits: number;
  sessionCapBaseUnits: number;
  sellerUsdtAddress: string;
}

const explorerTx = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;

export async function createSettler(
  mnemonic: string,
  cfg: SettlementConfig,
  opts: SettlerOptions,
) {
  const account = await signingAccount(mnemonic, cfg);
  let spentBaseUnits = 0;

  /** Price + cap-check + pay for one completed request. Never charges on rejection or tx failure. */
  async function settle(requestId: string, stats: MeterStats): Promise<SettlementReceipt> {
    const decision = evaluateSettlement({
      stats,
      spentBaseUnits,
      pricePer1kBaseUnits: opts.pricePer1kBaseUnits,
      sessionCapBaseUnits: opts.sessionCapBaseUnits,
    });
    const base: SettlementReceipt = {
      v: PROTOCOL_VERSION,
      requestId,
      generatedTokens: decision.generatedTokens,
      promptTokens: decision.promptTokens,
      amountBaseUnits: decision.amountBaseUnits,
      status: "pending",
      chain: "sepolia",
    };

    if (decision.status === "rejected") {
      return { ...base, status: "rejected", reason: decision.reason };
    }

    try {
      const { hash } = await account.transfer({
        token: cfg.usdtContract,
        recipient: opts.sellerUsdtAddress,
        amount: decision.amountBaseUnits,
      });
      spentBaseUnits += decision.amountBaseUnits; // only count what actually sent
      return { ...base, status: "settled", txHash: hash, explorerUrl: explorerTx(hash) };
    } catch (err) {
      return { ...base, status: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    address: account.address,
    settle,
    get spentBaseUnits() {
      return spentBaseUnits;
    },
    dispose: () => account.dispose(),
  };
}
