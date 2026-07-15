import { NextRequest, NextResponse } from "next/server";
import { assertWalletMatches, requireAuthedWallet } from "@/lib/apiAuth";
import { dinariClient } from "@/lib/dinari/client";
import { getDinariWalletChainId, requireOwnedDinariIds } from "@/lib/dinari/session";
import type { DinariWalletChainId } from "@/lib/dinari/types";

/**
 * POST /api/dinari/wallet/nonce
 * Get a Dinari nonce/message for the user to sign with Crossmint.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authResult = await requireAuthedWallet(request, body.authToken);
    if (!authResult.ok) {
      return authResult.response;
    }

    const { accountId, walletAddress } = body as {
      accountId?: string;
      walletAddress?: string;
    };

    if (!accountId || !walletAddress) {
      return NextResponse.json(
        { error: "Missing required fields: accountId, walletAddress" },
        { status: 400 }
      );
    }

    const mismatch = assertWalletMatches(authResult.session.walletAddress, walletAddress);
    if (mismatch) {
      return mismatch;
    }

    const ownership = await requireOwnedDinariIds({
      userId: authResult.session.userId,
      walletAddress: authResult.session.walletAddress,
      accountId,
    });
    if (!ownership.ok) {
      return NextResponse.json({ error: ownership.error }, { status: ownership.status });
    }

    const chainId = (body.chainId as DinariWalletChainId | undefined) ?? getDinariWalletChainId();

    const nonceResponse = await dinariClient.v2.accounts.wallet.external.getNonce(
      ownership.accountId,
      {
        chain_id: chainId,
        wallet_address: walletAddress,
      }
    );

    return NextResponse.json({
      accountId: ownership.accountId,
      walletAddress,
      chainId,
      nonce: nonceResponse.nonce,
      message: nonceResponse.message,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to get Dinari wallet nonce:", message);
    return NextResponse.json({ error: "Failed to get wallet nonce", details: message }, { status: 500 });
  }
}
