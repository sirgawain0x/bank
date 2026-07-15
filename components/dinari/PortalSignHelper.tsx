"use client";

import { useEffect, useState } from "react";
import { EVMWallet, useWallet } from "@crossmint/client-sdk-react-ui";

const PLACEHOLDER_WALLET = "0xYOUR_WALLET_ADDRESS";

/** Template — wallet address is filled from the connected Crossmint wallet. */
const buildDefaultDinariPortalMessage = (walletAddress: string) =>
  `By signing this message, I affirm that I am the rightful and exclusive owner of this wallet and I agree to the terms set forth by Dinari found at https://dinari.com/terms .

Wallet Address: ${walletAddress}
Date: 
Nonce: `;

/**
 * Sign an EIP-191 message from the Dinari Partners portal with the Crossmint wallet,
 * then copy the signature into the portal's "Enter Wallet Signature" field.
 */
export function DinariPortalSignHelper() {
  const { wallet } = useWallet();
  const [message, setMessage] = useState(() =>
    buildDefaultDinariPortalMessage(PLACEHOLDER_WALLET)
  );
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [copied, setCopied] = useState(false);

  // Keep the "Wallet Address:" line in sync with the connected Crossmint wallet
  useEffect(() => {
    const address = wallet?.address;
    if (!address) return;

    setMessage((prev) => {
      const next = prev.replace(
        /(Wallet Address:\s*)(0x[a-fA-F0-9]{40}|0xYOUR_WALLET_ADDRESS)/,
        `$1${address}`
      );
      // If the template had no address line match yet, inject connected address into the default template
      if (next === prev && prev.includes(PLACEHOLDER_WALLET)) {
        return buildDefaultDinariPortalMessage(address);
      }
      return next;
    });
  }, [wallet?.address]);

  const handleSign = async () => {
    if (!wallet) {
      setError("No Crossmint wallet connected");
      return;
    }
    setIsSigning(true);
    setError(null);
    setSignature(null);
    setCopied(false);

    try {
      const evmWallet = EVMWallet.from(wallet);
      const result = await evmWallet.signMessage({ message });
      if (!result.signature) {
        throw new Error("Wallet did not return a signature");
      }
      setSignature(result.signature);
    } catch (err: unknown) {
      const messageText = err instanceof Error ? err.message : "Failed to sign message";
      setError(messageText);
    } finally {
      setIsSigning(false);
    }
  };

  const handleCopy = async () => {
    if (!signature) return;
    try {
      await navigator.clipboard.writeText(signature);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard — select and copy the signature manually");
    }
  };

  return (
    <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50/50 p-6 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-slate-900">Dinari Portal Signature Helper</h2>
      <p className="mb-4 text-sm text-slate-600">
        Paste the verification message from the Dinari Partners portal (step 2), sign with your
        Crossmint wallet, then paste the signature into step 3. The wallet address line updates
        automatically to your connected Crossmint address.
      </p>

      {wallet?.address && (
        <p className="mb-3 font-mono text-xs text-slate-500">Connected: {wallet.address}</p>
      )}

      <label htmlFor="dinari-portal-message" className="mb-1 block text-sm font-medium text-slate-700">
        Message to sign (EIP-191)
      </label>
      <textarea
        id="dinari-portal-message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={8}
        className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        aria-label="Dinari portal message to sign"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSign}
          disabled={isSigning || !wallet || !message.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          aria-label="Sign Dinari portal message with Crossmint wallet"
        >
          {isSigning ? "Signing…" : "Sign with Crossmint"}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          {error.toLowerCase().includes("422") || error.toLowerCase().includes("unprocessable") ? (
            <p className="mt-2 text-xs">
              Tip: Crossmint often needs the smart wallet deployed first — send a tiny tx on Base
              Sepolia, then try signing again.
            </p>
          ) : null}
        </div>
      )}

      {signature && (
        <div className="mt-4 space-y-2">
          <label htmlFor="dinari-portal-signature" className="block text-sm font-medium text-slate-700">
            Signature (paste into Dinari step 3)
          </label>
          <textarea
            id="dinari-portal-signature"
            readOnly
            value={signature}
            rows={3}
            className="w-full rounded-lg border border-green-200 bg-white px-3 py-2 font-mono text-xs text-slate-800"
            aria-label="Wallet signature hash"
          />
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Copy signature to clipboard"
          >
            {copied ? "Copied" : "Copy signature"}
          </button>
        </div>
      )}
    </div>
  );
}
