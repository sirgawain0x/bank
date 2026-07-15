/** CAIP-2 chain IDs accepted by Dinari wallet.external APIs */
export type DinariWalletChainId = "eip155:8453" | "eip155:84532";

export type DinariMode = "sandbox" | "production";

export type DinariSession = {
  mode: DinariMode;
  entityId: string;
  accountId: string;
  kycStatus: "APPROVED" | "PENDING";
  kycComplete: boolean;
  walletLinked: boolean;
  walletAddress: string;
  chainId: DinariWalletChainId;
};
