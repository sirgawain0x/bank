import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";
import { requireAuthedWallet } from "@/lib/apiAuth";
import { requireOwnedDinariIds } from "@/lib/dinari/session";

/**
 * POST /api/dinari/orders
 * Create a new order in Dinari (entity must belong to the authed user).
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthedWallet(request);
    if (!authResult.ok) {
      return authResult.response;
    }

    const body = await request.json();
    const { entityId, assetId, quantity, orderType } = body;

    if (!entityId || !assetId || !quantity || !orderType) {
      return NextResponse.json(
        { error: "Missing required fields: entityId, assetId, quantity, orderType" },
        { status: 400 }
      );
    }

    const ownership = await requireOwnedDinariIds({
      userId: authResult.session.userId,
      walletAddress: authResult.session.walletAddress,
      entityId,
    });
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status });
    }

    // Placeholder until order placement is wired to Dinari SDK
    return NextResponse.json({
      message: "Order creation endpoint ready - implementation pending Dinari SDK confirmation",
      entityId: ownership.entityId,
      accountId: ownership.accountId,
      assetId,
      quantity,
      orderType,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to create Dinari order:", message);
    return NextResponse.json({ error: "Failed to create order", details: message }, { status: 500 });
  }
}

/**
 * GET /api/dinari/orders
 * List orders for the authenticated user's Dinari account only.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthedWallet(request);
    if (!authResult.ok) {
      return authResult.response;
    }

    const ownership = await requireOwnedDinariIds({
      userId: authResult.session.userId,
      walletAddress: authResult.session.walletAddress,
    });
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status });
    }

    const orders = await dinariClient.v2.accounts.orders.list(ownership.accountId);

    return NextResponse.json(orders.data ?? []);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to list Dinari orders:", message);
    return NextResponse.json({ error: "Failed to list orders", details: message }, { status: 500 });
  }
}
