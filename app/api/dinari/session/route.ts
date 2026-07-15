import { NextRequest, NextResponse } from "next/server";
import { requireAuthedWallet } from "@/lib/apiAuth";
import { resolveDinariSession } from "@/lib/dinari/session";

/**
 * GET /api/dinari/session
 * Resolve Dinari entity/account for the logged-in wallet (sandbox ENV vs production per-user).
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAuthedWallet(request);
    if (!authResult.ok) {
      return authResult.response;
    }
    const { userId, walletAddress } = authResult.session;

    const session = await resolveDinariSession({ userId, walletAddress });

    return NextResponse.json(session);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to resolve Dinari session:", message);
    return NextResponse.json({ error: "Failed to resolve Dinari session", details: message }, { status: 500 });
  }
}
