import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";
import { requireAuthedWallet } from "@/lib/apiAuth";
import { requireOwnedDinariIds } from "@/lib/dinari/session";

/**
 * GET /api/dinari/entities/[id]
 * Get entity details from Dinari (caller must own the entity).
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuthedWallet(request);
    if (!authResult.ok) {
      return authResult.response;
    }

    const params = await context.params;
    const entityId = params.id;

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID is required" }, { status: 400 });
    }

    const ownership = await requireOwnedDinariIds({
      userId: authResult.session.userId,
      walletAddress: authResult.session.walletAddress,
      entityId,
    });
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status });
    }

    const entity = await dinariClient.v2.entities.retrieveByID(entityId);

    return NextResponse.json(entity);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to fetch Dinari entity:`, message);
    return NextResponse.json({ error: "Failed to fetch entity", details: message }, { status: 500 });
  }
}
