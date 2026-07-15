import { NextRequest, NextResponse } from "next/server";
import { assertWalletMatches, requireAuthedWallet } from "@/lib/apiAuth";
import { dinariClient } from "@/lib/dinari/client";
import {
  getDinariWalletChainId,
  markDinariWalletLinked,
  requireOwnedDinariIds,
} from "@/lib/dinari/session";
import type { DinariWalletChainId } from "@/lib/dinari/types";

/**
 * POST /api/dinari/wallet/connect
 * Connect Crossmint wallet to Dinari account after signing the nonce message.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const authResult = await requireAuthedWallet(request, body.authToken);
    if (!authResult.ok) {
      return authResult.response;
    }

    const { accountId, walletAddress, nonce, signature, chainId: bodyChainId } = body as {
      accountId?: string;
      walletAddress?: string;
      nonce?: string;
      signature?: string;
      chainId?: DinariWalletChainId;
    };

    if (!accountId || !walletAddress || !nonce || !signature) {
      return NextResponse.json(
        { error: "Missing required fields: accountId, walletAddress, nonce, signature" },
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

    const chainId = bodyChainId ?? getDinariWalletChainId();

    const wallet = await dinariClient.v2.accounts.wallet.external.connect(ownership.accountId, {
      chain_id: chainId,
      nonce,
      signature,
      wallet_address: walletAddress,
    });

    await markDinariWalletLinked(authResult.session.userId);

    return NextResponse.json({
      walletLinked: true,
      address: wallet.address,
      chainId: wallet.chain_id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Failed to connect Dinari wallet:", message);
    return NextResponse.json({ error: "Failed to connect wallet", details: message }, { status: 500 });
  }
}
