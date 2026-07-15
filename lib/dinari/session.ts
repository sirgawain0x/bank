import { dinariClient } from "@/lib/dinari/client";
import { getPool } from "@/lib/cockroachdb";
import type { DinariMode, DinariSession, DinariWalletChainId } from "@/lib/dinari/types";

export type { DinariMode, DinariSession, DinariWalletChainId };

export const getDinariMode = (): DinariMode => {
  const env = process.env.NEXT_PUBLIC_DINARI_ENVIRONMENT;
  return env === "production" ? "production" : "sandbox";
};

/**
 * CAIP-2 chain ID for Dinari wallet linking.
 * Base mainnet: eip155:8453; Base Sepolia: eip155:84532.
 */
export const getDinariWalletChainId = (): DinariWalletChainId => {
  const chain = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (chain === "base-sepolia") {
    return "eip155:84532";
  }
  return "eip155:8453";
};

const resolveAccountId = async (entityId: string, preferredAccountId?: string): Promise<string> => {
  if (preferredAccountId) {
    return preferredAccountId;
  }

  const listed = await dinariClient.v2.entities.accounts.list(entityId);
  const first = listed.data?.[0];
  if (first?.id) {
    return first.id;
  }

  const created = await dinariClient.v2.entities.accounts.create(entityId);
  return created.id;
};

const isWalletLinked = async (accountId: string, walletAddress: string): Promise<boolean> => {
  try {
    const wallet = await dinariClient.v2.accounts.wallet.get(accountId);
    return wallet.address.toLowerCase() === walletAddress.toLowerCase();
  } catch {
    return false;
  }
};

const getKycStatus = async (
  entityId: string
): Promise<{ kycComplete: boolean; kycStatus: "APPROVED" | "PENDING" }> => {
  const entity = await dinariClient.v2.entities.retrieveByID(entityId);
  const kycComplete = Boolean(entity.is_kyc_complete);
  return {
    kycComplete,
    kycStatus: kycComplete ? "APPROVED" : "PENDING",
  };
};

type UserDinariRow = {
  dinari_entity_id: string | null;
  dinari_account_id: string | null;
  dinari_wallet_linked_at: Date | string | null;
};

/**
 * Resolve Dinari entity + account for the authed user.
 * Sandbox: fixed ENV entity. Production: create once and persist on users.
 */
export const resolveDinariSession = async (params: {
  userId: string;
  walletAddress: string;
  displayName?: string;
}): Promise<DinariSession> => {
  const mode = getDinariMode();
  const chainId = getDinariWalletChainId();
  const pool = getPool();

  let entityId: string;
  let accountId: string;

  if (mode === "sandbox") {
    const sandboxEntityId = process.env.DINARI_SANDBOX_ENTITY_ID?.trim();
    if (!sandboxEntityId) {
      throw new Error(
        "DINARI_SANDBOX_ENTITY_ID is required when NEXT_PUBLIC_DINARI_ENVIRONMENT=sandbox"
      );
    }
    entityId = sandboxEntityId;
    accountId = await resolveAccountId(
      entityId,
      process.env.DINARI_SANDBOX_ACCOUNT_ID?.trim() || undefined
    );
  } else {
    const { rows } = await pool.query<UserDinariRow>(
      `SELECT dinari_entity_id, dinari_account_id, dinari_wallet_linked_at
       FROM users WHERE crossmint_user_id = $1 LIMIT 1`,
      [params.userId]
    );
    const row = rows[0];

    if (row?.dinari_entity_id && row?.dinari_account_id) {
      entityId = row.dinari_entity_id;
      accountId = row.dinari_account_id;
    } else if (row?.dinari_entity_id) {
      entityId = row.dinari_entity_id;
      accountId = await resolveAccountId(entityId);
      await pool.query(
        `UPDATE users SET dinari_account_id = $1, updated_at = now()
         WHERE crossmint_user_id = $2`,
        [accountId, params.userId]
      );
    } else {
      const existing = await dinariClient.v2.entities.list({
        reference_id: params.userId,
        limit: 1,
      });
      const existingEntity = existing.data?.[0];

      if (existingEntity?.id) {
        entityId = existingEntity.id;
      } else {
        const entity = await dinariClient.v2.entities.create({
          name: params.displayName || "Creative Bank User",
          reference_id: params.userId,
        });
        entityId = entity.id;
      }

      accountId = await resolveAccountId(entityId);
      await pool.query(
        `UPDATE users
         SET dinari_entity_id = $1, dinari_account_id = $2, updated_at = now()
         WHERE crossmint_user_id = $3`,
        [entityId, accountId, params.userId]
      );
    }
  }

  const { kycComplete, kycStatus } = await getKycStatus(entityId);
  const walletLinked = await isWalletLinked(accountId, params.walletAddress);

  return {
    mode,
    entityId,
    accountId,
    kycStatus,
    kycComplete,
    walletLinked,
    walletAddress: params.walletAddress,
    chainId,
  };
};

export const markDinariWalletLinked = async (userId: string): Promise<void> => {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET dinari_wallet_linked_at = now(), updated_at = now()
     WHERE crossmint_user_id = $1`,
    [userId]
  );
};
