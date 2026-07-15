import { dinariClient } from "@/lib/dinari/client";
import { getPool } from "@/lib/cockroachdb";
import { getWalletChain } from "@/lib/walletConfig";
import type { DinariMode, DinariSession, DinariWalletChainId } from "@/lib/dinari/types";

export type { DinariMode, DinariSession, DinariWalletChainId };

export const getDinariMode = (): DinariMode => {
  const env = process.env.NEXT_PUBLIC_DINARI_ENVIRONMENT;
  return env === "production" ? "production" : "sandbox";
};

/**
 * CAIP-2 chain ID for Dinari wallet linking.
 * Aligns with Crossmint `getWalletChain` (production always Base mainnet).
 */
export const getDinariWalletChainId = (): DinariWalletChainId => {
  return getWalletChain() === "base-sepolia" ? "eip155:84532" : "eip155:8453";
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

const isUniqueViolation = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code) : "";
  // Postgres / Cockroach unique_violation
  return code === "23505";
};

/**
 * Atomically claim DINARI_SANDBOX_ACCOUNT_ID for this user if unclaimed.
 * Relies on unique index idx_users_dinari_account_id to prevent double-claim races.
 */
const tryClaimSandboxAccountId = async (
  userId: string,
  preferredAccountId: string
): Promise<string | null> => {
  const pool = getPool();
  try {
    const { rows } = await pool.query<{ dinari_account_id: string }>(
      `UPDATE users
       SET dinari_account_id = $1, updated_at = now()
       WHERE crossmint_user_id = $2
         AND dinari_account_id IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM users other
           WHERE other.dinari_account_id = $1
         )
       RETURNING dinari_account_id`,
      [preferredAccountId, userId]
    );
    return rows[0]?.dinari_account_id ?? null;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
};

/**
 * Resolve a unique sandbox account for this user under the shared sandbox entity.
 * Prefer a previously persisted account; optionally claim DINARI_SANDBOX_ACCOUNT_ID
 * atomically if unclaimed; otherwise create a new account.
 */
const resolveSandboxAccountId = async (params: {
  userId: string;
  entityId: string;
  existingAccountId: string | null;
}): Promise<string> => {
  if (params.existingAccountId) {
    return params.existingAccountId;
  }

  const preferredAccountId = process.env.DINARI_SANDBOX_ACCOUNT_ID?.trim();
  if (preferredAccountId) {
    const claimed = await tryClaimSandboxAccountId(params.userId, preferredAccountId);
    if (claimed) {
      return claimed;
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

  // Always verify against Dinari so a changed/unlinked wallet cannot stay "linked"
  const walletLinked = await isWalletLinked(accountId, params.walletAddress);
  if (walletLinked && !row?.dinari_wallet_linked_at) {
    await markDinariWalletLinked(params.userId);
  } else if (!walletLinked && row?.dinari_wallet_linked_at) {
    await clearDinariWalletLinked(params.userId);
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

export const clearDinariWalletLinked = async (userId: string): Promise<void> => {
  const pool = getPool();
  await pool.query(
    `UPDATE users SET dinari_wallet_linked_at = NULL, updated_at = now()
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
