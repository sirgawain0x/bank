"use client";

import { useState, useEffect } from "react";
import { useDinariStocks, useDinariStockPrice, useDinariEntity } from "@/hooks/dinari/useDinariData";
import { formatUsd } from "@/lib/formatters";
import { useAuth } from "@/context/AuthContext";
import { useWallet } from "@crossmint/client-sdk-react-ui";

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
  const [entityId, setEntityId] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  
  const { status: authStatus } = useAuth();
  const { wallet } = useWallet();
  
  const { data: stocks, isLoading: stocksLoading, error: stocksError } = useDinariStocks();
  const { data: stockPrice, isLoading: priceLoading, error: priceError } = useDinariStockPrice(selectedStock?.symbol || "");
  const { data: entity, isLoading: entityLoading } = useDinariEntity(entityId || "");
  
  // Auto-select first stock when loaded
  useEffect(() => {
    if (stocks && stocks.length > 0 && !selectedStock) {
      setSelectedStock(stocks[0]);
    }
  }, [stocks, selectedStock]);
  
  // Check KYC status
  useEffect(() => {
    if (entity) {
      setKycStatus(entity.status);
    }
  }, [entity]);
  
  const handleCreateEntity = async () => {
    if (authStatus !== "logged-in" || !wallet) return;
    
    try {
      const response = await fetch("/api/dinari/entities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Creative Bank User",
          email: "user@example.com", // This would come from auth context
          walletAddress: wallet.address
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to create entity");
      }
      
      const result = await response.json();
      setEntityId(result.id);
    } catch (error) {
      console.error("Failed to create entity:", error);
    }
  };
  
  const handlePlaceOrder = async () => {
    if (!selectedStock || !quantity || !entityId) return;
    
    // Check KYC status before placing order
    if (kycStatus !== "APPROVED") {
      alert("KYC verification required before placing orders");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/dinari/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          entityId: entityId,
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
  
  const totalCost = selectedStock && quantity 
    ? parseFloat(quantity) * (stockPrice?.price || selectedStock.price || 0)
    : 0;
  
  if (stocksLoading || entityLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
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
  
  // Show KYC requirement if user doesn't have an entity
  if (!entityId) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">KYC Verification Required</h2>
        <p className="mb-4 text-slate-600">
          Before you can trade stocks, you need to complete KYC verification with Dinari.
        </p>
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={handleCreateEntity}
          disabled={authStatus !== "logged-in" || !wallet}
        >
          Start KYC Verification
        </button>
      </div>
    );
  }
  
  // Show KYC status
  if (kycStatus !== "APPROVED") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">KYC Verification in Progress</h2>
        <p className="mb-4 text-slate-600">
          Your KYC verification is currently {kycStatus?.toLowerCase() || "pending"}. 
          You'll be able to trade once it's approved.
        </p>
        <div className="rounded-lg bg-yellow-50 p-4">
          <p className="text-sm text-yellow-800">
            Entity ID: {entityId}
          </p>
          <p className="text-sm text-yellow-800">
            Status: {kycStatus || "Pending"}
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Stock Trading</h2>
        <div className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
          KYC Approved
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Stock Selection */}
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
        
        {/* Order Form */}
        <div>
          <h3 className="mb-2 text-sm font-medium text-slate-700">Place Order</h3>
          {selectedStock ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Order Type
                </label>
                <div className="flex gap-2">
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
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Quantity
                </label>
                <input
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
                    {formatUsd(stockPrice?.price || selectedStock.price)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-slate-600">Quantity</span>
                  <span className="font-medium">{quantity || "0"}</span>
                </div>
                <div className="mt-2 flex justify-between border-t border-slate-200 pt-2">
                  <span className="font-medium">Total</span>
                  <span className="font-bold text-blue-600">
                    {formatUsd(totalCost)}
                  </span>
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