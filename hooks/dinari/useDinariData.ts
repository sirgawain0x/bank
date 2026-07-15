import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import type { DinariSession } from "@/lib/dinari/types";

interface DinariStock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  currency: string;
  last_updated: string;
}

interface DinariOrder {
  id: string;
  entity_id: string;
  asset_id: string;
  quantity: number;
  order_type: "BUY" | "SELL";
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  created_at: string;
  updated_at: string;
  total_cost?: number;
  fees?: number;
}

interface DinariEntity {
  id: string;
  name?: string | null;
  is_kyc_complete: boolean;
  entity_type: "INDIVIDUAL" | "ORGANIZATION";
}

const authHeaders = (jwt: string | null | undefined): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }
  return headers;
};

/**
 * Resolve Dinari entity/account session for the logged-in user.
 */
export function useDinariSession() {
  const { jwt, status } = useAuth();

  return useQuery<DinariSession>({
    queryKey: ["dinari", "session"],
    queryFn: async () => {
      const response = await fetch("/api/dinari/session", {
        headers: authHeaders(jwt),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.details || body.error || "Failed to resolve Dinari session");
      }
      return response.json();
    },
    staleTime: 1000 * 60,
    enabled: status === "logged-in" && !!jwt,
  });
}

/**
 * Hook to fetch available stocks from Dinari
 */
export function useDinariStocks() {
  const { jwt } = useAuth();

  return useQuery<DinariStock[]>({
    queryKey: ["dinari", "stocks"],
    queryFn: async () => {
      const response = await fetch("/api/dinari/stocks", { headers: authHeaders(jwt) });
      if (!response.ok) {
        throw new Error("Failed to fetch stocks");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Hook to fetch a specific stock price from Dinari
 */
export function useDinariStockPrice(symbol: string) {
  const { jwt } = useAuth();

  return useQuery<{
    symbol: string;
    price: number;
  }>({
    queryKey: ["dinari", "stock", symbol],
    queryFn: async () => {
      const response = await fetch(`/api/dinari/price?symbol=${symbol}`, {
        headers: authHeaders(jwt),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch stock price");
      }
      return response.json();
    },
    staleTime: 1000 * 60,
    enabled: !!symbol,
  });
}

/**
 * Hook to fetch orders from Dinari
 */
export function useDinariOrders() {
  const { jwt } = useAuth();

  return useQuery<DinariOrder[]>({
    queryKey: ["dinari", "orders"],
    queryFn: async () => {
      const response = await fetch("/api/dinari/orders", { headers: authHeaders(jwt) });
      if (!response.ok) {
        throw new Error("Failed to fetch orders");
      }
      return response.json();
    },
    staleTime: 1000 * 60,
  });
}

/**
 * Hook to fetch entity details from Dinari
 */
export function useDinariEntity(entityId: string) {
  const { jwt } = useAuth();

  return useQuery<DinariEntity>({
    queryKey: ["dinari", "entity", entityId],
    queryFn: async () => {
      const response = await fetch(`/api/dinari/entities/${entityId}`, {
        headers: authHeaders(jwt),
      });
      if (!response.ok) {
        throw new Error("Failed to fetch entity");
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 10,
    enabled: !!entityId,
  });
}

type LinkWalletArgs = {
  accountId: string;
  walletAddress: string;
  chainId: string;
  message: string;
  nonce: string;
  signMessage: (message: string) => Promise<string>;
};

/**
 * Fetch nonce, sign with Crossmint, connect wallet to Dinari account.
 */
export function useDinariLinkWallet() {
  const { jwt } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      accountId,
      walletAddress,
      chainId,
      signMessage,
    }: Omit<LinkWalletArgs, "message" | "nonce"> & {
      signMessage: (message: string) => Promise<string>;
    }) => {
      const nonceRes = await fetch("/api/dinari/wallet/nonce", {
        method: "POST",
        headers: authHeaders(jwt),
        body: JSON.stringify({ accountId, walletAddress, chainId }),
      });
      if (!nonceRes.ok) {
        const body = await nonceRes.json().catch(() => ({}));
        throw new Error(body.details || body.error || "Failed to get wallet nonce");
      }
      const { nonce, message } = (await nonceRes.json()) as {
        nonce: string;
        message: string;
      };

      const signature = await signMessage(message);

      const connectRes = await fetch("/api/dinari/wallet/connect", {
        method: "POST",
        headers: authHeaders(jwt),
        body: JSON.stringify({
          accountId,
          walletAddress,
          chainId,
          nonce,
          signature,
        }),
      });
      if (!connectRes.ok) {
        const body = await connectRes.json().catch(() => ({}));
        throw new Error(body.details || body.error || "Failed to connect wallet");
      }
      return connectRes.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dinari", "session"] });
    },
  });
}
