import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";
import { requireAuthedWallet } from "@/lib/apiAuth";

/**
 * GET /api/dinari/price?symbol=AAPL
 * Fetch stock price from Dinari
 */
export async function GET(request: NextRequest) {
  try {
    // Require authentication
    const authResult = await requireAuthedWallet(request);
    if (!authResult.ok) {
      return authResult.response;
    }
    const { userId, walletAddress } = authResult.session;
    
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }
    
    // Fetch specific stock price
    const price = await dinariClient.v2.marketData.stocks.retrieveCurrentPrice(symbol);
    
    return NextResponse.json({
      symbol,
      price
    });
  } catch (error: any) {
    console.error(`Failed to fetch Dinari stock price:`, error.message);
    return NextResponse.json(
      { error: "Failed to fetch stock price", details: error.message },
      { status: 500 }
    );
  }
}