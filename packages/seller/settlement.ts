/**
 * Seller settlement view — watches the seller's USDT balance ON-CHAIN (read-only, keyless).
 *
 * The seller trusts the chain, not the buyer's claim: it polls its own USDT balance and
 * reports increases. This is what makes "both dashboards show the balance move" honest.
 */
import { readOnlyAccount, usdtBalanceBaseUnits, type SettlementConfig } from "@infermart/shared/wdk";

export interface BalanceUpdate {
  balanceBaseUnits: bigint;
  deltaBaseUnits: bigint;
}

/**
 * Poll `address`'s USDT balance every `intervalMs`; invoke `onChange` only when it moves.
 * Returns a stop() function.
 */
export function watchUsdtBalance(
  address: string,
  cfg: SettlementConfig,
  onChange: (u: BalanceUpdate) => void,
  intervalMs = 4000,
): () => void {
  const account = readOnlyAccount(address, cfg);
  let last: bigint | null = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const balance = await usdtBalanceBaseUnits(account, cfg);
      if (last === null) last = balance;
      else if (balance !== last) {
        onChange({ balanceBaseUnits: balance, deltaBaseUnits: balance - last });
        last = balance;
      }
    } catch {
      // transient RPC error — keep polling
    }
    if (!stopped) setTimeout(tick, intervalMs);
  }
  void tick();

  return () => {
    stopped = true;
  };
}
