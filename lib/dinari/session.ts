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

const persistAccountId = async (userId: string, accountId: string): Promise<void> => {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET dinari_account_id = $1, updated_at = now()
     WHERE crossmint_user_id = $2`,
    [accountId, userId]
  );
};

/**
 * Resolve a unique sandbox account for this user under the shared sandbox entity.
 * Prefer a previously persisted account; optionally claim DINARI_SANDBOX_ACCOUNT_ID
 * if no other user already owns it; otherwise create a new account.
 */
const resolveSandboxAccountId = async (params: {
  userId: string;
  entityId: string;
  existingAccountId: string | null;
}): Promise<string> => {
  if (params.existingAccountId) {
    return params.existingAccountId;
  }

  const pool = getPool();
  const preferredAccountId = process.env.DINARI_SANDBOX_ACCOUNT_ID?.trim();

  if (preferredAccountId) {
    const { rows: claimed } = await pool.query<{ crossmint_user_id: string }>(
      `SELECT crossmint_user_id FROM users
       WHERE dinari_account_id = $1 AND crossmint_user_id <> $2
       LIMIT 1`,
      [preferredAccountId, params.userId]
    );
    if (claimed.length === 0) {
      await persistAccountId(params.userId, preferredAccountId);
      return preferredAccountId;
    }
  }

  const created = await dinariClient.v2.entities.accounts.create(params.entityId);
  await persistAccountId(params.userId, created.id);
  return created.id;
};

/**
 * Lightweight ownership lookup without Dinari API calls when IDs are already persisted.
 * Returns null if the user has not completed session bootstrap yet.
 */
export const getPersistedDinariIds = async (
  userId: string
): Promise<{ entityId: string; accountId: string } | null> => {
  const mode = getDinariMode();
  const pool = getPool();
  const { rows } = await pool.query<UserDinariRow>(
    `SELECT dinari_entity_id, dinari_account_id, dinari_wallet_linked_at
     FROM users WHERE crossmint_user_id = $1 LIMIT 1`,
    [userId]
  );
  const row = rows[0];

  if (mode === "sandbox") {
    const sandboxEntityId = process.env.DINARI_SANDBOX_ENTITY_ID?.trim();
    if (!sandboxEntityId || !row?.dinari_account_id) {
      return null;
    }
    return { entityId: sandboxEntityId, accountId: row.dinari_account_id };
  }

  if (!row?.dinari_entity_id || !row?.dinari_account_id) {
    return null;
  }
  return { entityId: row.dinari_entity_id, accountId: row.dinari_account_id };
};

/**
 * Resolve Dinari entity + account for the authed user.
 * Sandbox: fixed ENV entity + per-user persisted account.
 * Production: create once and persist entity + account on users.
 */
export const resolveDinariSession = async (params: {
  userId: string;
  walletAddress: string;
  displayName?: string;
}): Promise<DinariSession> => {
  const mode = getDinariMode();
  const chainId = getDinariWalletChainId();
  const pool = getPool();

  const { rows } = await pool.query<UserDinariRow>(
    `SELECT dinari_entity_id, dinari_account_id, dinari_wallet_linked_at
     FROM users WHERE crossmint_user_id = $1 LIMIT 1`,
    [params.userId]
  );
  const row = rows[0];

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
    accountId = await resolveSandboxAccountId({
      userId: params.userId,
      entityId,
      existingAccountId: row?.dinari_account_id ?? null,
    });
  } else if (row?.dinari_entity_id && row?.dinari_account_id) {
    entityId = row.dinari_entity_id;
    accountId = row.dinari_account_id;
  } else if (row?.dinari_entity_id) {
    entityId = row.dinari_entity_id;
    accountId = await resolveAccountId(entityId);
    await persistAccountId(params.userId, accountId);
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

  const { kycComplete, kycStatus } = await getKycStatus(entityId);

  // Skip Dinari wallet lookup when we already persisted a successful link
  let walletLinked = Boolean(row?.dinari_wallet_linked_at);
  if (!walletLinked) {
    walletLinked = await isWalletLinked(accountId, params.walletAddress);
  }

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

/**
 * Ensure the claimed entity/account belongs to the authed user.
 * Bootstraps session IDs when not yet persisted.
 */
export const requireOwnedDinariIds = async (params: {
  userId: string;
  walletAddress: string;
  entityId?: string;
  accountId?: string;
}): Promise<
  | { ok: true; entityId: string; accountId: string }
  | { ok: false; status: 403; error: string }
> => {
  let owned = await getPersistedDinariIds(params.userId);
  if (!owned) {
    const session = await resolveDinariSession({
      userId: params.userId,
      walletAddress: params.walletAddress,
    });
    owned = { entityId: session.entityId, accountId: session.accountId };
  }

  if (params.entityId && params.entityId !== owned.entityId) {
    return { ok: false, status: 403, error: "Unauthorized access to entity" };
  }
  if (params.accountId && params.accountId !== owned.accountId) {
    return { ok: false, status: 403, error: "Unauthorized access to account" };
  }

  return { ok: true, entityId: owned.entityId, accountId: owned.accountId };
};
