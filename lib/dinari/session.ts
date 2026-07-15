import { dinariClient } from "@/lib/dinari/client";
import { getPool } from "@/lib/cockroachdb";
import { getWalletChain } from "@/lib/walletConfig";
import type {
  DinariMode,
  DinariSession,
  DinariWalletChainId,
  DinariWalletKind,
} from "@/lib/dinari/types";

export type { DinariMode, DinariSession, DinariWalletChainId, DinariWalletKind };

/** Optional override / display address for sandbox managed (Fordefi) EOA */
export const getSandboxManagedWalletAddress = (): string | null => {
  const fromEnv = process.env.DINARI_SANDBOX_WALLET_ADDRESS?.trim();
  return fromEnv ? fromEnv.toLowerCase() : null;
};

export const getDinariMode = (): DinariMode => {
  const env = process.env.NEXT_PUBLIC_DINARI_ENVIRONMENT;
  return env === "production" ? "production" : "sandbox";
};

/**
 * CAIP-2 chain ID for Dinari wallet linking.
 * Sandbox always uses Base Sepolia (eip155:84532) so Partners portal / Crossmint staging match.
 * Production follows Crossmint `getWalletChain` (Base mainnet when NODE_ENV=production).
 */
export const getDinariWalletChainId = (): DinariWalletChainId => {
  if (getDinariMode() === "sandbox") {
    return "eip155:84532";
  }
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

type AccountWalletSnapshot = {
  address: string | null;
  isManaged: boolean;
};

const getAccountWalletSnapshot = async (accountId: string): Promise<AccountWalletSnapshot> => {
  try {
    const wallet = await dinariClient.v2.accounts.wallet.get(accountId);
    return {
      address: wallet?.address?.toLowerCase() ?? null,
      isManaged: Boolean(wallet?.is_managed_wallet),
    };
  } catch {
    return { address: null, isManaged: false };
  }
};

const resolveWalletKind = (
  snapshot: AccountWalletSnapshot,
  accountId: string
): DinariWalletKind => {
  const preferredAccountId = process.env.DINARI_SANDBOX_ACCOUNT_ID?.trim();
  // Interim sandbox: preferred Partners managed account is always treated as managed
  if (getDinariMode() === "sandbox" && preferredAccountId && accountId === preferredAccountId) {
    return "managed";
  }
  if (snapshot.isManaged) {
    return "managed";
  }
  const configured = getSandboxManagedWalletAddress();
  if (
    getDinariMode() === "sandbox" &&
    configured &&
    snapshot.address &&
    snapshot.address === configured
  ) {
    return "managed";
  }
  return "external";
};

/**
 * External linking requires Crossmint address === Dinari wallet address.
 * Sandbox managed (Fordefi) EOAs are already registered in Partners — skip EIP-191 link.
 */
const isWalletLinked = (
  snapshot: AccountWalletSnapshot,
  walletAddress: string,
  walletKind: DinariWalletKind
): boolean => {
  if (getDinariMode() === "sandbox" && walletKind === "managed") {
    // Prefer Dinari API address, but don't block testing if get() is empty for managed accounts
    return Boolean(snapshot.address) || Boolean(getSandboxManagedWalletAddress());
  }
  if (!snapshot.address) {
    return false;
  }
  return snapshot.address === walletAddress.toLowerCase();
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
 * Force this user onto DINARI_SANDBOX_ACCOUNT_ID (sandbox testing only).
 * Releases the account from any other user so the shared managed wallet can be used.
 */
const forceClaimSandboxAccountId = async (
  userId: string,
  preferredAccountId: string
): Promise<string> => {
  const pool = getPool();
  await pool.query(
    `UPDATE users
     SET dinari_account_id = NULL, dinari_wallet_linked_at = NULL, updated_at = now()
     WHERE dinari_account_id = $1 AND crossmint_user_id <> $2`,
    [preferredAccountId, userId]
  );
  await pool.query(
    `UPDATE users SET dinari_account_id = $1, updated_at = now()
     WHERE crossmint_user_id = $2`,
    [preferredAccountId, userId]
  );
  return preferredAccountId;
};

/**
 * Resolve sandbox account under the shared entity.
 * When DINARI_SANDBOX_ACCOUNT_ID is set, always use that managed account (Fordefi EOA).
 * Otherwise reuse a persisted account or create a new one.
 */
const resolveSandboxAccountId = async (params: {
  userId: string;
  entityId: string;
  existingAccountId: string | null;
}): Promise<string> => {
  const preferredAccountId = process.env.DINARI_SANDBOX_ACCOUNT_ID?.trim();

  if (preferredAccountId) {
    if (params.existingAccountId === preferredAccountId) {
      return preferredAccountId;
    }
    return forceClaimSandboxAccountId(params.userId, preferredAccountId);
  }

  if (params.existingAccountId) {
    return params.existingAccountId;
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

  const walletSnapshot = await getAccountWalletSnapshot(accountId);
  const walletKind = resolveWalletKind(walletSnapshot, accountId);
  const dinariWalletAddress =
    walletSnapshot.address ??
    (walletKind === "managed" ? getSandboxManagedWalletAddress() : null);

  // Always verify against Dinari so a changed/unlinked wallet cannot stay "linked"
  const walletLinked = isWalletLinked(walletSnapshot, params.walletAddress, walletKind);
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
    dinariWalletAddress,
    walletKind,
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
