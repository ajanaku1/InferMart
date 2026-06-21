/**
 * Shared WDK helpers — the real settlement pillar (EVM Sepolia).
 *
 * One place to read settlement config from env and build wallets, so the buyer
 * (signing) and seller (read-only) agree on chain, RPC, and USDT contract.
 */
import WalletManagerEvm, { WalletAccountReadOnlyEvm } from "@tetherto/wdk-wallet-evm";

export interface SettlementConfig {
  rpcUrl: string;
  chainId: number;
  usdtContract: string;
  usdtDecimals: number;
}

/** Read + validate settlement config from the environment (throws early if misconfigured). */
export function settlementConfigFromEnv(env = process.env): SettlementConfig {
  const rpcUrl = env.RPC_URL;
  const usdtContract = env.USDT_CONTRACT;
  if (!rpcUrl) throw new Error("RPC_URL is required for settlement");
  if (!usdtContract) throw new Error("USDT_CONTRACT is required (deploy MockUSDT or set a faucet token)");
  return {
    rpcUrl,
    chainId: Number(env.CHAIN_ID ?? 11155111),
    usdtContract,
    usdtDecimals: Number(env.USDT_DECIMALS ?? 6),
  };
}

/** A signing account derived from a BIP-39 mnemonic (the buyer's spending wallet). */
export async function signingAccount(mnemonic: string, cfg: SettlementConfig) {
  const wallet = new WalletManagerEvm(mnemonic, { provider: cfg.rpcUrl, chainId: cfg.chainId });
  return wallet.getAccount(0);
}

/** A keyless read-only account for watching any address's balance (the seller dashboard). */
export function readOnlyAccount(address: string, cfg: SettlementConfig) {
  return new WalletAccountReadOnlyEvm(address, { provider: cfg.rpcUrl, chainId: cfg.chainId });
}

/** USDT balance of an address, in integer base-units (6 decimals). */
export async function usdtBalanceBaseUnits(
  account: { getTokenBalance(token: string): Promise<bigint> },
  cfg: SettlementConfig,
): Promise<bigint> {
  return account.getTokenBalance(cfg.usdtContract);
}
