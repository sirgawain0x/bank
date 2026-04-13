"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Address, encodeFunctionData, formatUnits, parseUnits } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { useAuth, useWallet } from "@crossmint/client-sdk-react-ui";
import {
  bigDecimal,
  evmAddress,
  useVaultDeposit,
  useVaultDepositPreview,
} from "@aave/react";

import { Modal } from "@/components/common/Modal";
import { useAaveWalletClient } from "@/hooks/useAaveWalletClient";
import { AAVE_TARGET_CHAIN_ID } from "@/lib/config/aave";
import { formatUsd } from "@/lib/formatters";
import { formatVaultShares } from "@/lib/yearnUtils";
import { toast } from "sonner";

type WithdrawInputMode = "shares" | "asset";

const TX_CONFIRMATION_TIMEOUT_MS = 120_000;

function isFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg === "failed to fetch" ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg === "network request failed"
  );
}

async function withRetry<T>(fn: () => PromiseLike<T> | Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.resolve(fn());
    } catch (err) {
      if (!isFetchError(err) || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error("Unreachable");
}

const ERC4626_REDEEM_ABI = [
  {
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    name: "redeem",
    outputs: [{ name: "assets", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ERC4626_WITHDRAW_ABI = [
  {
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    name: "withdraw",
    outputs: [{ name: "shares", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const ERC4626_PREVIEW_REDEEM_ABI = [
  {
    inputs: [{ name: "shares", type: "uint256" }],
    name: "previewRedeem",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC4626_PREVIEW_WITHDRAW_ABI = [
  {
    inputs: [{ name: "assets", type: "uint256" }],
    name: "previewWithdraw",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

const ERC4626_CONVERT_TO_ASSETS_ABI = [
  {
    inputs: [{ name: "shares", type: "uint256" }],
    name: "convertToAssets",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

type AaveVaultModalProps = {
  open: boolean;
  onClose: () => void;
  vaultAddress: Address;
  assetSymbol?: string;
  assetDecimals?: number;
  shareDecimals?: number;
  mode: "deposit" | "withdraw";
  userAddress: Address | undefined;
  userAssetBalance?: bigint;
  shareBalance?: bigint;
  isBalanceLoading?: boolean;
  onSuccess?: () => void;
};

export function AaveVaultModal({
  open,
  onClose,
  vaultAddress,
  assetSymbol = "USDC",
  assetDecimals = 6,
  shareDecimals,
  mode,
  userAddress,
  userAssetBalance = 0n,
  shareBalance = 0n,
  isBalanceLoading = false,
  onSuccess,
}: AaveVaultModalProps) {
  const { address: wagmiAddress } = useAccount();
  const walletClient = useAaveWalletClient();
  const publicClient = usePublicClient();
  const { status: authStatus } = useAuth();
  const { status: walletStatus } = useWallet();

  const [deposit] = useVaultDeposit();
  // Withdrawals use direct ERC-4626 contract calls for both execution
  // and previews. The Aave API is unreliable ("Service panicked" errors).
  const [depositPreview] = useVaultDepositPreview();

  const [inputAmount, setInputAmount] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expectedShares, setExpectedShares] = useState<string | null>(null);
  const [expectedAssets, setExpectedAssets] = useState<string | null>(null);
  const [expectedSharesToBurn, setExpectedSharesToBurn] = useState<string | null>(null);
  const [expectedSharesToBurnDecimals, setExpectedSharesToBurnDecimals] = useState<number>(18);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [withdrawInputMode, setWithdrawInputMode] = useState<WithdrawInputMode>("shares");
  const [shareBalanceInUsdc, setShareBalanceInUsdc] = useState<string | null>(null);
  const [isShareBalanceUsdcLoading, setIsShareBalanceUsdcLoading] = useState(false);

  const isWithdrawAssetMode = mode === "withdraw" && withdrawInputMode === "asset";

  const resolvedShareDecimals = shareDecimals;
  const isShareDecimalsLoading = mode === "withdraw" && resolvedShareDecimals == null;

  const inputDecimals = useMemo(() => {
    if (mode === "deposit") return assetDecimals;
    if (mode === "withdraw") {
      return withdrawInputMode === "shares" ? resolvedShareDecimals ?? 18 : assetDecimals;
    }
    return assetDecimals;
  }, [mode, withdrawInputMode, assetDecimals, resolvedShareDecimals]);

  const normalizeAmountForBigDecimal = useCallback(
    (raw: string, decimals: number): string | null => {
      const cleaned = raw.trim();
      if (!cleaned || cleaned === ".") return null;

      let noExp = cleaned;
      if (noExp.toLowerCase().includes("e")) {
        const num = Number(noExp);
        if (!Number.isFinite(num) || num < 0) return null;
        noExp = num.toFixed(decimals);
      }

      if (noExp.startsWith(".")) noExp = `0${noExp}`;

      try {
        const units = parseUnits(noExp, decimals);
        return formatUnits(units, decimals);
      } catch {
        return null;
      }
    },
    [],
  );

  const normalizedInputAmount = useMemo(() => {
    return normalizeAmountForBigDecimal(inputAmount, inputDecimals);
  }, [inputAmount, inputDecimals, normalizeAmountForBigDecimal]);

  const inputUnits = useMemo(() => {
    if (normalizedInputAmount == null) return null;
    try {
      return parseUnits(normalizedInputAmount, inputDecimals);
    } catch {
      return null;
    }
  }, [normalizedInputAmount, inputDecimals]);

  const hasPositiveInput = inputUnits != null && inputUnits > 0n;

  useEffect(() => {
    if (mode === "deposit" && hasPositiveInput && normalizedInputAmount != null) {
      setExpectedAssets(null);
      Promise.resolve(
        depositPreview({
          vault: evmAddress(vaultAddress),
          chainId: AAVE_TARGET_CHAIN_ID,
          amount: bigDecimal(normalizedInputAmount),
        }),
      )
        .then((result) => {
          if (result.isOk() && result.value?.amount?.value != null) {
            setExpectedShares(String(result.value.amount.value));
          } else {
            setExpectedShares(null);
          }
        })
        .catch(() => {
          setExpectedShares(null);
          setErrorMessage("Unable to preview deposit — please check your connection and try again.");
        });
    } else {
      setExpectedShares(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- depositPreview is stable from hook
  }, [mode, hasPositiveInput, normalizedInputAmount, vaultAddress]);

  useEffect(() => {
    if (mode !== "withdraw" || !hasPositiveInput || !publicClient || inputUnits == null) {
      setExpectedAssets(null);
      setExpectedSharesToBurn(null);
      return;
    }

    if (withdrawInputMode === "shares") {
      if (resolvedShareDecimals == null) {
        setExpectedAssets(null);
        setExpectedShares(null);
        return;
      }
      setExpectedShares(null);
      setExpectedSharesToBurn(null);
      let aborted = false;
      publicClient
        .readContract({
          address: vaultAddress,
          abi: ERC4626_PREVIEW_REDEEM_ABI,
          functionName: "previewRedeem",
          args: [inputUnits],
        })
        .then((assets) => {
          if (!aborted) setExpectedAssets(formatUnits(assets, assetDecimals));
        })
        .catch(() => {
          if (!aborted) {
            setExpectedAssets(null);
            setErrorMessage("Unable to preview withdrawal — please try again.");
          }
        });
      return () => { aborted = true; };
    } else if (withdrawInputMode === "asset") {
      if (resolvedShareDecimals == null) {
        setExpectedAssets(null);
        setExpectedSharesToBurn(null);
        return;
      }
      setExpectedShares(null);
      setExpectedAssets(null);
      let aborted = false;
      publicClient
        .readContract({
          address: vaultAddress,
          abi: ERC4626_PREVIEW_WITHDRAW_ABI,
          functionName: "previewWithdraw",
          args: [inputUnits],
        })
        .then((shares) => {
          if (!aborted) {
            setExpectedSharesToBurn(formatUnits(shares, resolvedShareDecimals));
            setExpectedSharesToBurnDecimals(resolvedShareDecimals);
          }
        })
        .catch(() => {
          if (!aborted) {
            setExpectedSharesToBurn(null);
            setErrorMessage("Unable to preview withdrawal — please try again.");
          }
        });
      return () => { aborted = true; };
    } else {
      setExpectedAssets(null);
      setExpectedSharesToBurn(null);
    }
  }, [mode, withdrawInputMode, hasPositiveInput, inputUnits, vaultAddress, publicClient, assetDecimals, resolvedShareDecimals]);

  useEffect(() => {
    if (mode !== "withdraw" || !shareBalance || shareBalance === 0n || !publicClient) {
      setShareBalanceInUsdc(null);
      return;
    }
    if (resolvedShareDecimals == null) {
      setShareBalanceInUsdc(null);
      return;
    }
    setIsShareBalanceUsdcLoading(true);
    let aborted = false;
    publicClient
      .readContract({
        address: vaultAddress,
        abi: ERC4626_CONVERT_TO_ASSETS_ABI,
        functionName: "convertToAssets",
        args: [shareBalance],
      })
      .then((assets) => {
        if (!aborted) setShareBalanceInUsdc(formatUnits(assets, assetDecimals));
      })
      .catch(() => {
        if (!aborted) setShareBalanceInUsdc(null);
      })
      .finally(() => {
        if (!aborted) setIsShareBalanceUsdcLoading(false);
      });
    return () => { aborted = true; };
  }, [mode, shareBalance, vaultAddress, assetDecimals, publicClient, resolvedShareDecimals]);

  const shareBalanceInUsdcUnits = useMemo(() => {
    if (shareBalanceInUsdc == null) return null;
    try {
      return parseUnits(shareBalanceInUsdc, assetDecimals);
    } catch {
      return null;
    }
  }, [shareBalanceInUsdc, assetDecimals]);

  const expectedSharesToBurnNormalized = useMemo(() => {
    if (expectedSharesToBurn == null) return null;
    return normalizeAmountForBigDecimal(
      expectedSharesToBurn,
      expectedSharesToBurnDecimals,
    );
  }, [expectedSharesToBurn, expectedSharesToBurnDecimals, normalizeAmountForBigDecimal]);

  const expectedSharesToBurnUnits = useMemo(() => {
    if (expectedSharesToBurnNormalized == null) return null;
    try {
      return parseUnits(expectedSharesToBurnNormalized, expectedSharesToBurnDecimals);
    } catch {
      return null;
    }
  }, [expectedSharesToBurnNormalized, expectedSharesToBurnDecimals]);

  const sendAndWait = useCallback(
    async (tx: { to: string; data: string; value?: string }) => {
      if (!walletClient || !publicClient || !userAddress)
        throw new Error("Wallet or RPC not available");
      const valueBigInt = tx.value ? BigInt(tx.value) : 0n;
      const hash = await walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: (tx.data || "0x") as `0x${string}`,
        value: valueBigInt,
        account: { address: userAddress, type: "json-rpc" },
        chain: publicClient.chain as never as import("viem").Chain,
      });
      await publicClient.waitForTransactionReceipt({
        hash,
        timeout: TX_CONFIRMATION_TIMEOUT_MS,
      });
      return hash;
    },
    [walletClient, publicClient, userAddress],
  );

  const resetForm = useCallback(() => {
    setInputAmount("");
    setErrorMessage(null);
  }, []);

  const handleClose = useCallback(() => {
    resetForm();
    onClose();
  }, [onClose, resetForm]);

  const validate = useCallback((): string | null => {
    if (!userAddress) {
      if (authStatus === "initializing" || walletStatus === "in-progress") return "Wallet is connecting...";
      return "Connect a wallet to continue.";
    }
    if (mode === "withdraw" && isShareDecimalsLoading) return "Loading share decimals...";
    if (!hasPositiveInput || inputUnits == null) return "Please enter a valid amount.";
    if (mode === "deposit") {
      if (isBalanceLoading) return "Balance is loading...";
      if (userAssetBalance < inputUnits) return `Insufficient ${assetSymbol} balance.`;
    } else {
      if (withdrawInputMode === "shares") {
        if (shareBalance < inputUnits) return "Insufficient vault shares.";
      } else {
        if (isShareBalanceUsdcLoading) return "Balance is loading...";
        if (shareBalanceInUsdcUnits == null) return "Balance is loading...";
        if (shareBalanceInUsdcUnits === 0n) {
          return `Insufficient balance. Maximum withdrawable: ${shareBalanceInUsdc ?? "0"} ${assetSymbol}.`;
        }
        if (inputUnits > shareBalanceInUsdcUnits) {
          return `Insufficient balance. Maximum withdrawable: ${shareBalanceInUsdc ?? "0"} ${assetSymbol}.`;
        }
      }
    }
    return null;
  }, [
    userAddress,
    hasPositiveInput,
    inputUnits,
    mode,
    withdrawInputMode,
    isShareDecimalsLoading,
    isBalanceLoading,
    isShareBalanceUsdcLoading,
    shareBalanceInUsdcUnits,
    shareBalanceInUsdc,
    userAssetBalance,
    shareBalance,
    assetDecimals,
    assetSymbol,
    authStatus,
    walletStatus,
  ]);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setErrorMessage(null);

      const err = validate();
      if (err) {
        setErrorMessage(err);
        return;
      }

      if (
        !walletClient ||
        !publicClient ||
        !userAddress ||
        normalizedInputAmount == null ||
        inputUnits == null
      ) {
        setErrorMessage("Wallet or amount not ready.");
        return;
      }

      setIsSubmitting(true);
      try {
        if (mode === "deposit") {
          const depositResult = await withRetry(() => deposit({
            chainId: AAVE_TARGET_CHAIN_ID,
            vault: evmAddress(vaultAddress),
            amount: { value: bigDecimal(normalizedInputAmount) },
            depositor: evmAddress(userAddress),
          }));

          if (depositResult.isErr()) {
            setErrorMessage(depositResult.error?.message ?? "Deposit failed");
            return;
          }

          const plan = depositResult.value;
          if (plan.__typename === "InsufficientBalanceError") {
            setErrorMessage(`Insufficient balance. Required: ${plan.required?.value} ${assetSymbol}.`);
            return;
          }

          if (plan.__typename === "TransactionRequest") {
            await sendAndWait(plan);
          } else {
            await sendAndWait(plan.approval);
            await sendAndWait(plan.originalTransaction);
          }

          toast.success("Deposit complete", {
            description: `${formatUsd(normalizedInputAmount)} ${assetSymbol} deposited successfully.`,
          });
        } else {
          // Withdraw directly via the vault's ERC-4626 contract.
          // The Aave API is not needed for withdrawals and is unreliable
          // (returns "Service panicked" errors), so we call the vault directly.
          if (withdrawInputMode === "shares") {
            const data = encodeFunctionData({
              abi: ERC4626_REDEEM_ABI,
              functionName: "redeem",
              args: [inputUnits, userAddress, userAddress],
            });
            await sendAndWait({ to: vaultAddress, data });
          } else {
            const data = encodeFunctionData({
              abi: ERC4626_WITHDRAW_ABI,
              functionName: "withdraw",
              args: [inputUnits, userAddress, userAddress],
            });
            await sendAndWait({ to: vaultAddress, data });
          }

          toast.success("Withdraw complete", {
            description: `${formatUsd(normalizedInputAmount)} ${assetSymbol} withdrawn successfully.`,
          });
        }

        resetForm();
        onSuccess?.();
        handleClose();
      } catch (err) {
        if (isFetchError(err)) {
          setErrorMessage("Network error — please check your connection and try again.");
        } else {
          const message = err instanceof Error ? err.message : mode === "deposit" ? "Deposit failed" : "Withdraw failed";
          setErrorMessage(message);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      validate,
      mode,
      withdrawInputMode,
      walletClient,
      publicClient,
      userAddress,
      normalizedInputAmount,
      inputUnits,
      vaultAddress,
      deposit,
      sendAndWait,
      assetSymbol,
      onSuccess,
      handleClose,
      resetForm,
    ],
  );

  const handleMaxClick = useCallback(() => {
    if (mode === "deposit" && userAssetBalance !== undefined) {
      setInputAmount(formatUnits(userAssetBalance, assetDecimals));
    } else if (mode === "withdraw") {
      if (withdrawInputMode === "shares" && shareBalance !== undefined) {
        setInputAmount(formatUnits(shareBalance, resolvedShareDecimals ?? 18));
      } else if (withdrawInputMode === "asset" && shareBalanceInUsdc != null) {
        setInputAmount(shareBalanceInUsdc);
      }
    }
  }, [mode, withdrawInputMode, userAssetBalance, shareBalance, shareBalanceInUsdc, assetDecimals, resolvedShareDecimals]);

  if (!open) return null;

  const title = mode === "deposit" ? `Deposit ${assetSymbol}` : `Withdraw ${assetSymbol}`;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      showCloseButton
      className="max-w-lg bg-white text-slate-900"
    >
      <form className="mt-6 flex w-full flex-col gap-5 text-sm text-slate-700" onSubmit={handleSubmit}>
        {mode === "withdraw" && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase text-slate-500">
              Withdraw by
            </span>
            <div
              className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5"
              role="group"
              aria-label="Withdraw input mode"
            >
              <button
                type="button"
                onClick={() => {
                  setWithdrawInputMode("shares");
                  setInputAmount("");
                  setErrorMessage(null);
                }}
                className={
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition " +
                  (withdrawInputMode === "shares"
                    ? "bg-white text-slate-900 shadow"
                    : "text-slate-600 hover:text-slate-900")
                }
                aria-pressed={withdrawInputMode === "shares"}
                aria-label="Enter amount in shares"
              >
                Shares
              </button>
              <button
                type="button"
                onClick={() => {
                  setWithdrawInputMode("asset");
                  setInputAmount("");
                  setErrorMessage(null);
                }}
                className={
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition " +
                  (withdrawInputMode === "asset"
                    ? "bg-white text-slate-900 shadow"
                    : "text-slate-600 hover:text-slate-900")
                }
                aria-pressed={withdrawInputMode === "asset"}
                aria-label={`Enter amount in ${assetSymbol}`}
              >
                {assetSymbol}
              </button>
            </div>
          </div>
        )}
        <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase text-slate-500">
                {mode === "deposit"
                  ? `${assetSymbol} Amount`
                  : isWithdrawAssetMode
                    ? `${assetSymbol} to Withdraw`
                    : "Shares to Redeem"}
              </span>
              <span className="text-xs text-slate-500">
                Balance:{" "}
                {mode === "deposit"
                  ? isBalanceLoading
                    ? "Loading..."
                    : formatUnits(userAssetBalance, assetDecimals)
                  : isShareBalanceUsdcLoading
                    ? "Loading..."
                    : shareBalance === 0n
                      ? `0 shares`
                      : isShareDecimalsLoading
                        ? "Loading shares..."
                        : `${formatVaultShares(shareBalance, resolvedShareDecimals ?? 18)} shares${
                            shareBalanceInUsdc != null ? ` (≈ ${shareBalanceInUsdc} ${assetSymbol})` : ""
                          }`}
              </span>
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={inputAmount}
              onChange={(e) => { setInputAmount(e.target.value); setErrorMessage(null); }}
              placeholder="0.00"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
              aria-label={
                mode === "deposit"
                  ? "Amount to deposit"
                  : isWithdrawAssetMode
                    ? `${assetSymbol} amount to withdraw`
                    : "Shares to redeem"
              }
            />
            <button
              type="button"
              onClick={handleMaxClick}
              disabled={
                mode === "withdraw" &&
                (isShareDecimalsLoading ||
                  (withdrawInputMode === "asset" &&
                    (shareBalanceInUsdcUnits == null ||
                      isShareBalanceUsdcLoading ||
                      shareBalanceInUsdcUnits === 0n)))
              }
              className="self-end text-xs font-medium text-slate-600 underline hover:text-slate-800 disabled:opacity-50 disabled:no-underline"
            >
              Max
            </button>
            {mode === "deposit" && expectedShares != null && (
              <p className="text-xs text-slate-500">
                You will receive approximately {expectedShares} vault shares
              </p>
            )}
            {mode === "withdraw" && withdrawInputMode === "shares" && expectedAssets != null && (
              <p className="text-xs text-slate-500">
                {normalizedInputAmount != null && (
                  <>
                    {normalizedInputAmount} shares ≈ {expectedAssets} {assetSymbol}
                    <br />
                  </>
                )}
                You will receive approximately {expectedAssets} {assetSymbol}
              </p>
            )}
            {mode === "withdraw" && withdrawInputMode === "asset" && (
              <p className="text-xs text-slate-500">
                You will withdraw {normalizedInputAmount || "0"} {assetSymbol}
                {expectedSharesToBurnUnits != null && (
                  <>
                    <br />
                    Shares to burn:{" "}
                    {formatVaultShares(
                      expectedSharesToBurnUnits,
                      expectedSharesToBurnDecimals,
                    )}{" "}
                    shares
                  </>
                )}
              </p>
            )}
          </label>
        </section>

        {errorMessage ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              isSubmitting ||
              !hasPositiveInput ||
              inputUnits == null ||
              (mode === "withdraw" && isShareDecimalsLoading)
            }
            className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {isSubmitting ? "Confirming..." : mode === "deposit" ? "Deposit" : "Withdraw"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
