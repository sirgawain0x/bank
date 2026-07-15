"use client";

import { useEffect, useState } from "react";
import { EVMWallet, useWallet } from "@crossmint/client-sdk-react-ui";
import {
  useDinariLinkWallet,
  useDinariSession,
  useDinariStockPrice,
  useDinariStocks,
} from "@/hooks/dinari/useDinariData";
import { formatUsd } from "@/lib/formatters";
import { useAuth } from "@/context/AuthContext";

interface DinariStock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  currency: string;
  last_updated: string;
}

export function DinariStockTrading() {
  const [selectedStock, setSelectedStock] = useState<DinariStock | null>(null);
  const [quantity, setQuantity] = useState<string>("1");
  const [orderType, setOrderType] = useState<"BUY" | "SELL">("BUY");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const { status: authStatus, jwt } = useAuth();
  const { wallet } = useWallet();

  const {
    data: session,
    isLoading: sessionLoading,
    error: sessionError,
    refetch: refetchSession,
  } = useDinariSession();
  const { data: stocks, isLoading: stocksLoading, error: stocksError } = useDinariStocks();
  const {
    data: stockPrice,
    isLoading: priceLoading,
  } = useDinariStockPrice(selectedStock?.symbol || "");
  const linkWallet = useDinariLinkWallet();

  useEffect(() => {
    if (stocks && stocks.length > 0 && !selectedStock) {
      setSelectedStock(stocks[0]);
    }
  }, [stocks, selectedStock]);

  const handleLinkWallet = async () => {
    if (!session || !wallet?.address) return;
    setLinkError(null);

    try {
      const evmWallet = EVMWallet.from(wallet);
      await linkWallet.mutateAsync({
        accountId: session.accountId,
        walletAddress: wallet.address.toLowerCase(),
        chainId: session.chainId,
        signMessage: async (message: string) => {
          const result = await evmWallet.signMessage({ message });
          if (!result.signature) {
            throw new Error("Wallet did not return a signature");
          }
          return result.signature;
        },
      });
      await refetchSession();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to link wallet";
      console.error("Failed to link Dinari wallet:", error);
      setLinkError(message);
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedStock || !quantity || !session?.entityId) return;

    if (session.kycStatus !== "APPROVED") {
      alert("KYC verification required before placing orders");
      return;
    }
    if (!session.walletLinked) {
      alert("Link your wallet before placing orders");
      return;
    }

    setIsSubmitting(true);
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      if (jwt) {
        headers.Authorization = `Bearer ${jwt}`;
      }

      const response = await fetch("/api/dinari/orders", {
        method: "POST",
        headers,
        body: JSON.stringify({
          entityId: session.entityId,
          assetId: selectedStock.id,
          quantity: parseFloat(quantity),
          orderType,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to place order");
      }

      const result = await response.json();
      console.log("Order placed:", result);
      alert("Order placed successfully!");
    } catch (error) {
      console.error("Failed to place order:", error);
      alert("Failed to place order. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCost =
    selectedStock && quantity
      ? parseFloat(quantity) * (stockPrice?.price || selectedStock.price || 0)
      : 0;

  if (sessionLoading || stocksLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  if (sessionError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load Dinari session: {sessionError.message}
        {sessionError.message.includes("DINARI_SANDBOX_ENTITY_ID") && (
          <p className="mt-2 text-xs">
            Set <code className="font-mono">DINARI_SANDBOX_ENTITY_ID</code> from your Dinari
            dashboard when running in sandbox mode.
          </p>
        )}
      </div>
    );
  }

  if (stocksError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load stock data: {stocksError.message}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Unable to resolve Dinari session.
      </div>
    );
  }

  if (!session.walletLinked) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Link Wallet to Dinari</h2>
        <p className="mb-4 text-slate-600">
          Prove ownership of your Crossmint wallet so Dinari can whitelist it for dShares.
        </p>
        <div className="mb-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            Mode: <span className="font-medium">{session.mode}</span>
          </p>
          <p>
            Entity ID: <span className="font-mono text-xs">{session.entityId}</span>
          </p>
          <p>
            Account ID: <span className="font-mono text-xs">{session.accountId}</span>
          </p>
          <p>
            KYC: <span className="font-medium">{session.kycStatus}</span>
          </p>
        </div>
        {linkError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {linkError}
          </div>
        )}
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={handleLinkWallet}
          disabled={
            authStatus !== "logged-in" || !wallet || linkWallet.isPending
          }
          aria-label="Link Crossmint wallet to Dinari"
        >
          {linkWallet.isPending ? "Linking…" : "Link Wallet"}
        </button>
      </div>
    );
  }

  if (session.kycStatus !== "APPROVED") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">KYC Verification Required</h2>
        <p className="mb-4 text-slate-600">
          Your wallet is linked. Complete KYC in the Dinari Partners portal before trading.
        </p>
        <div className="rounded-lg bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            Entity ID: <span className="font-mono text-xs">{session.entityId}</span>
          </p>
          <p className="text-sm text-yellow-800">Status: {session.kycStatus}</p>
          <p className="text-sm text-yellow-800">Mode: {session.mode}</p>
        </div>
        <button
          type="button"
          className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          onClick={() => refetchSession()}
          aria-label="Refresh KYC status"
        >
          Refresh status
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Stock Trading</h2>
        <div className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
          KYC Approved · Wallet Linked
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Select Stock</h3>
          <div className="space-y-2">
            {stocks?.map((stock) => (
              <button
                key={stock.id}
                type="button"
                className={`w-full rounded-lg border p-3 text-left transition ${
                  selectedStock?.id === stock.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
                onClick={() => setSelectedStock(stock)}
              >
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">{stock.symbol}</div>
                    <div className="text-sm text-slate-500">{stock.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatUsd(stock.price)}</div>
                    <div className="text-xs text-slate-500">{stock.currency}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Place Order</h3>
          {selectedStock ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="order-type">
                  Order Type
                </label>
                <div className="flex gap-2" id="order-type">
                  <button
                    type="button"
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                      orderType === "BUY"
                        ? "border-green-500 bg-green-50 text-green-700"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                    onClick={() => setOrderType("BUY")}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                      orderType === "SELL"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                    onClick={() => setOrderType("SELL")}
                  >
                    Sell
                  </button>
                </div>
              </div>

              <div>
                <label
                  className="mb-1 block text-sm font-medium text-slate-700"
                  htmlFor="order-quantity"
                >
                  Quantity
                </label>
                <input
                  id="order-quantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="rounded-lg bg-slate-50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Price per share</span>
                  <span className="font-medium">
                    {priceLoading
                      ? "…"
                      : formatUsd(stockPrice?.price || selectedStock.price)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-slate-600">Quantity</span>
                  <span className="font-medium">{quantity || "0"}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-medium">Total</span>
                  <span className="font-bold text-blue-600">{formatUsd(totalCost)}</span>
                </div>
              </div>

              <button
                type="button"
                className={`w-full rounded-lg py-2 text-sm font-semibold text-white transition ${
                  orderType === "BUY"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                } ${isSubmitting ? "opacity-50" : ""}`}
                onClick={handlePlaceOrder}
                disabled={isSubmitting || !quantity || parseFloat(quantity) <= 0}
              >
                {isSubmitting ? "Placing Order..." : `${orderType} ${selectedStock.symbol}`}
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              Select a stock to begin trading
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
