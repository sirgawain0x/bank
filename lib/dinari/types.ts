/** CAIP-2 chain IDs accepted by Dinari wallet.external APIs */
export type DinariWalletChainId = "eip155:8453" | "eip155:84532";

export type DinariMode = "sandbox" | "production";

/** How the Dinari account holds its trading wallet */
export type DinariWalletKind = "managed" | "external";

export type DinariSession = {
  mode: DinariMode;
  entityId: string;
  accountId: string;
  kycStatus: "APPROVED" | "PENDING";
  kycComplete: boolean;
  walletLinked: boolean;
  /** Crossmint (or app) wallet used for auth — may differ from Dinari trading wallet in sandbox */
  walletAddress: string;
  /** Address registered on the Dinari account (managed Fordefi EOA or linked external) */
  dinariWalletAddress: string | null;
  walletKind: DinariWalletKind;
  chainId: DinariWalletChainId;
};
