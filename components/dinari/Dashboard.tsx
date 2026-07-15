"use client";

import { useState } from "react";
import { DinariStockTrading } from "./StockTrading";
import { DinariPortalSignHelper } from "./PortalSignHelper";
import { useDinariSession, useDinariStocks } from "@/hooks/dinari/useDinariData";

export function DinariDashboard() {
  const [activeTab, setActiveTab] = useState<"trade" | "portfolio" | "orders">("trade");

  const { data: session } = useDinariSession();
  const { data: stocks, isLoading, error } = useDinariStocks();
  const showPortalSignHelper =
    session?.mode === "production" || session?.walletKind === "external";

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load Dinari data: {error.message}
        </div>
        {showPortalSignHelper ? <DinariPortalSignHelper /> : null}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-slate-900">Stock Trading</h1>
        <p className="text-sm text-slate-600">
          {session?.walletKind === "managed"
            ? "Sandbox: trading against your Dinari managed (Fordefi) wallet"
            : "Trade tokenized stocks directly from your Creative Bank account"}
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-white p-1">
        <div className="flex">
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === "trade"
                ? "bg-blue-100 text-blue-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("trade")}
          >
            Trade
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === "portfolio"
                ? "bg-blue-100 text-blue-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("portfolio")}
          >
            Portfolio
          </button>
          <button
            type="button"
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === "orders"
                ? "bg-blue-100 text-blue-700"
                : "text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("orders")}
          >
            Orders
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {activeTab === "trade" && <DinariStockTrading />}

        {activeTab === "portfolio" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Your Portfolio</h2>
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
              <p className="text-slate-500">
                Your stock portfolio will appear here once you make your first trade.
              </p>
            </div>
          </div>
        )}

        {activeTab === "orders" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-slate-900">Order History</h2>
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
              <p className="text-slate-500">
                Your order history will appear here once you place your first trade.
              </p>
            </div>
          </div>
        )}
      </div>

      {showPortalSignHelper ? <DinariPortalSignHelper /> : null}
    </div>
  );
}
