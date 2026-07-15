import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";

/**
 * GET /api/dinari/stocks/[symbol]
 * Fetch specific stock details from Dinari
 */
export async function GET(request: NextRequest, context: { params: Promise<{ symbol: string }> }) {
  try {
    const params = await context.params;
    const stockSymbol = params.symbol;
    
    if (!stockSymbol) {
      return NextResponse.json(
        { error: "Symbol is required" },
        { status: 400 }
      );
    }
    
    // Fetch specific stock price
    const price = await dinariClient.v2.marketData.stocks.retrieveCurrentPrice(stockSymbol);
    
    return NextResponse.json({
      symbol: stockSymbol,
      price
    });
  } catch (error: any) {
    console.error(`Failed to fetch Dinari stock:`, error.message);
    return NextResponse.json(
      { error: "Failed to fetch stock", details: error.message },
      { status: 500 }
    );
  }
}