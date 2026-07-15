"use client";

import type { DinariSession } from "@/lib/dinari/types";

type SandboxManagedWalletPanelProps = {
  session: DinariSession;
};

/**
 * Sandbox-only: show the Dinari-managed (Fordefi) EOA used for Partners portal testing.
 * Orders run against this account — Crossmint signing is not required.
 */
export const SandboxManagedWalletPanel = ({ session }: SandboxManagedWalletPanelProps) => {
  if (session.mode !== "sandbox" || session.walletKind !== "managed") {
    return null;
  }

  const tradingWallet =
    session.dinariWalletAddress ?? "Fetch wallet from Dinari (check DINARI_SANDBOX_ACCOUNT_ID)";

  return (
    <section
      className="rounded-2xl border border-amber-200 bg-amber-50 p-5"
      aria-label="Sandbox managed wallet for testing"
    >
      <h2 className="text-base font-semibold text-amber-950">Sandbox test wallet (Dinari / Fordefi)</h2>
      <p className="mt-1 text-sm text-amber-900/80">
        Interim testing uses your Partners-portal managed EOA. Crossmint wallet linking is skipped
        until Dinari supports SCW signatures.
      </p>
      <dl className="mt-4 space-y-2 text-sm text-amber-950">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="shrink-0 font-medium">Account ID</dt>
          <dd className="break-all font-mono text-xs">{session.accountId}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="shrink-0 font-medium">Trading wallet</dt>
          <dd className="break-all font-mono text-xs">{tradingWallet}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="shrink-0 font-medium">Login wallet (Crossmint)</dt>
          <dd className="break-all font-mono text-xs">{session.walletAddress}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="shrink-0 font-medium">Chain</dt>
          <dd className="font-mono text-xs">{session.chainId}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
          <dt className="shrink-0 font-medium">Link status</dt>
          <dd>{session.walletLinked ? "Ready (managed)" : "Not ready — check account env vars"}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-amber-900/70">
        Custody for this EOA is on Dinari&apos;s managed wallet stack (Fordefi). Place orders via the
        Trade tab once KYC is approved; signing happens on Dinari&apos;s side for managed accounts.
      </p>
    </section>
  );
};
