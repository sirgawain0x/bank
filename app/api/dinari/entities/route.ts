import { NextRequest, NextResponse } from "next/server";
import { dinariClient } from "@/lib/dinari/client";
import { requireAuthedWallet } from "@/lib/apiAuth";

/**
 * POST /api/dinari/entities
 * Create a new entity (KYC) in Dinari
 */
export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const authResult = await requireAuthedWallet(request);
    if (!authResult.ok) {
      return authResult.response;
    }

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
    }

    // Create entity in Dinari
    const entity = await dinariClient.v2.entities.create({
      name,
    });

    return NextResponse.json(entity);
  } catch (error: any) {
    console.error("Failed to create Dinari entity:", error.message);
    return NextResponse.json(
      { error: "Failed to create entity", details: error.message },
      { status: 500 }
    );
  }
}
