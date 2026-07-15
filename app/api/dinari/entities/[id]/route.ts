import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";
import { requireAuthedWallet } from "@/lib/apiAuth";

/**
 * GET /api/dinari/entities/[id]
 * Get entity details from Dinari
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Require authentication
    const authResult = await requireAuthedWallet(request);
    if (!authResult.ok) {
      return authResult.response;
    }

    const params = await context.params;
    const entityId = params.id;

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID is required" }, { status: 400 });
    }

    // Get entity details
    const entity = await dinariClient.v2.entities.retrieveByID(entityId);

    return NextResponse.json(entity);
  } catch (error: any) {
    console.error(`Failed to fetch Dinari entity:`, error.message);
    return NextResponse.json(
      { error: "Failed to fetch entity", details: error.message },
      { status: 500 }
    );
  }
}
