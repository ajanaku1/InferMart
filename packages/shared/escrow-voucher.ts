/**
 * Receipt-anchored escrow vouchers — the buyer's half of the payment channel.
 *
 * After verifying a provider-signed usage receipt (receipts.ts), the buyer
 * signs an EIP-712 voucher whose `receiptHash` commits to that exact signed
 * receipt. The voucher authorizes InferMartEscrow.sol to pay the seller up to
 * `cumulativeAmount` in this channel epoch. Anyone can relay the claim; the
 * contract only ever pays the channel's seller.
 *
 * Money path: mirrors the contract's checks exactly and is covered by
 * tests/escrow-voucher.test.ts.
 */
import { ethers } from "ethers";
import { canonicalReceiptPayload, type SignedUsageReceipt } from "./receipts.ts";

export interface VoucherFields {
  channelId: string; // bytes32 hex
  epoch: bigint;
  cumulativeAmount: bigint; // token base units (6 decimals for the demo USDT)
  receiptHash: string; // bytes32 hex
}

export interface VoucherDomain {
  chainId: bigint | number;
  verifyingContract: string;
}

const TYPES = {
  Voucher: [
    { name: "channelId", type: "bytes32" },
    { name: "epoch", type: "uint64" },
    { name: "cumulativeAmount", type: "uint256" },
    { name: "receiptHash", type: "bytes32" },
  ],
} as const;

function domainOf(d: VoucherDomain): ethers.TypedDataDomain {
  return { name: "InferMartEscrow", version: "1", chainId: d.chainId, verifyingContract: d.verifyingContract };
}

/** Channel id exactly as the contract computes it. */
export function channelIdOf(buyer: string, seller: string, token: string): string {
  return ethers.keccak256(ethers.solidityPacked(["address", "address", "address"], [buyer, seller, token]));
}

/**
 * The bytes32 the voucher commits to: the canonical receipt payload PLUS the
 * provider's signature, so the voucher anchors to one specific signed receipt,
 * not just its contents.
 */
export function receiptHashOf(signed: SignedUsageReceipt): string {
  const { signature, ...receipt } = signed;
  const payload = canonicalReceiptPayload(receipt);
  return ethers.keccak256(Buffer.concat([payload, Buffer.from(signature, "hex")]));
}

/** Sign a voucher with the buyer's EVM key. Returns the compact signature parts. */
export async function signVoucher(
  buyer: ethers.Wallet | ethers.HDNodeWallet,
  domain: VoucherDomain,
  fields: VoucherFields,
): Promise<{ v: number; r: string; s: string }> {
  const sig = await buyer.signTypedData(domainOf(domain), TYPES, fields);
  const { v, r, s } = ethers.Signature.from(sig);
  return { v, r, s };
}

/** Recover the signer of a voucher; the contract requires this to be the channel's buyer. */
export function recoverVoucherSigner(
  domain: VoucherDomain,
  fields: VoucherFields,
  sig: { v: number; r: string; s: string },
): string {
  return ethers.verifyTypedData(domainOf(domain), TYPES, fields, sig);
}

/**
 * The claim math the contract enforces, mirrored so the buyer can refuse to
 * sign a voucher the contract would reject. Throws on anything not strictly
 * claimable; money-path code never guesses.
 */
export function computeClaimDelta(alreadyClaimed: bigint, deposited: bigint, cumulativeAmount: bigint): bigint {
  if (cumulativeAmount <= alreadyClaimed) throw new Error("voucher pays nothing new");
  if (cumulativeAmount > deposited) throw new Error("voucher exceeds the deposit");
  return cumulativeAmount - alreadyClaimed;
}
