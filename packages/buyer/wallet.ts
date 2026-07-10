/**
 * Buyer settlement — turns a finished QVAC request into a real on-chain USDT transfer.
 *
 * Composes the TDD'd metering money-path with the WDK wallet: price the work, enforce
 * the session spend cap (never send over-cap), transfer USDT, return a SettlementReceipt
 * both dashboards render. At-most-once is keyed by requestId at the call site.
 */
import { evaluateSettlement, evaluateLegSettlement, type ModalityPrices } from "@infermart/shared/metering";
import type { MeterStats, SettlementReceipt, LegReceipt } from "@infermart/shared/protocol";
import { PROTOCOL_VERSION } from "@infermart/shared/protocol";
import type { Modality } from "@infermart/shared/receipts";
import { signingAccount, type SettlementConfig } from "@infermart/shared/wdk";

export interface SettlerOptions {
  pricePer1kBaseUnits: number;
  sessionCapBaseUnits: number;
  sellerUsdtAddress: string;
  /** Phase-2 per-modality prices for voice-pipeline legs. */
  prices: ModalityPrices;
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

  /**
   * Price + cap-check + pay for one verified voice-pipeline leg. The units come
   * from a provider-signed receipt the caller has already verified.
   */
  async function settleLeg(requestId: string, modality: Modality, units: number): Promise<LegReceipt> {
    const decision = evaluateLegSettlement({
      modality,
      units,
      prices: opts.prices,
      spentBaseUnits,
      sessionCapBaseUnits: opts.sessionCapBaseUnits,
    });
    const base: LegReceipt = {
      v: PROTOCOL_VERSION,
      requestId,
      modality,
      unitKind: decision.unitKind,
      units,
      amountBaseUnits: decision.amountBaseUnits,
      status: "pending",
      chain: "sepolia",
    };

    if (decision.status === "rejected") {
      return { ...base, status: "rejected", reason: decision.reason };
    }
    if (decision.amountBaseUnits === 0) {
      return { ...base, status: "settled", reason: "zero-cost leg" };
    }

    try {
      const { hash } = await account.transfer({
        token: cfg.usdtContract,
        recipient: opts.sellerUsdtAddress,
        amount: decision.amountBaseUnits,
      });
      spentBaseUnits += decision.amountBaseUnits;
      return { ...base, status: "settled", txHash: hash, explorerUrl: explorerTx(hash) };
    } catch (err) {
      return { ...base, status: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
  }

  return {
    address: account.address,
    settle,
    settleLeg,
    /** Send the firewall deposit to the seller. Returns the tx hash. */
    async deposit(amountBaseUnits: number): Promise<string> {
      const { hash } = await account.transfer({
        token: cfg.usdtContract,
        recipient: opts.sellerUsdtAddress,
        amount: amountBaseUnits,
      });
      return hash;
    },
    get spentBaseUnits() {
      return spentBaseUnits;
    },
    dispose: () => account.dispose(),
  };
}
