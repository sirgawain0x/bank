import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";
import { requireAuthedWallet } from "@/lib/apiAuth";

/**
 * GET /api/dinari/stocks
 * Fetch available stocks from Dinari
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const authResult = await requireAuthedWallet(request);
    if (!authResult.ok) {
      return authResult.response;
    }

    // Fetch available stocks (paginated envelope → array for the UI)
    const stocks = await dinariClient.v2.marketData.stocks.list();
    const items = (stocks.data ?? []).map((stock) => ({
      id: stock.id,
      symbol: stock.symbol,
      name: stock.name,
      price: 0,
      currency: "USD",
      last_updated: "",
      is_tradable: stock.is_tradable,
      is_fractionable: stock.is_fractionable,
    }));

    return NextResponse.json(items);
  } catch (error: any) {
    console.error("Failed to fetch Dinari stocks:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch stocks", details: error.message },
      { status: 500 }
    );
  }
}
