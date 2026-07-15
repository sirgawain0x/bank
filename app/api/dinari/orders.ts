import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";

/**
 * POST /api/dinari/orders
 * Create a new order in Dinari
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { entityId, assetId, quantity, orderType } = body;
    
    if (!entityId || !assetId || !quantity || !orderType) {
      return NextResponse.json(
        { error: "Missing required fields: entityId, assetId, quantity, orderType" },
        { status: 400 }
      );
    }
    
    // Create order in Dinari
    // Note: This is a placeholder - actual implementation depends on Dinari SDK methods
    return NextResponse.json({
      message: "Order creation endpoint ready - implementation pending Dinari SDK confirmation",
      entityId,
      assetId,
      quantity,
      orderType
    });
  } catch (error: any) {
    console.error("Failed to create Dinari order:", error.message);
    return NextResponse.json(
      { error: "Failed to create order", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/dinari/orders
 * List orders from Dinari
 */
export async function GET() {
  try {
    // List orders from Dinari
    const orders = await dinariClient.v2.listOrders();
    
    return NextResponse.json(orders);
  } catch (error: any) {
    console.error("Failed to list Dinari orders:", error.message);
    return NextResponse.json(
      { error: "Failed to list orders", details: error.message },
      { status: 500 }
    );
  }
}