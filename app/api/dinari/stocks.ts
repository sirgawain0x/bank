import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";

/**
 * GET /api/dinari/stocks
 * Fetch available stocks from Dinari
 */
export async function GET() {
  try {
    // Fetch available stocks
    const stocks = await dinariClient.v2.marketData.stocks.list();
    
    return NextResponse.json(stocks);
  } catch (error: any) {
    console.error("Failed to fetch Dinari stocks:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch stocks", details: error.message },
      { status: 500 }
    );
  }
}