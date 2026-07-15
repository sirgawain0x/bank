import { useQuery } from "@tanstack/react-query";

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
  order_type: 'BUY' | 'SELL';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  created_at: string;
  updated_at: string;
  total_cost?: number;
  fees?: number;
}

interface DinariEntity {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
  updated_at: string;
}

/**
 * Hook to fetch available stocks from Dinari
 */
export function useDinariStocks() {
  return useQuery<DinariStock[]>({
    queryKey: ['dinari', 'stocks'],
    queryFn: async () => {
      const response = await fetch('/api/dinari/stocks');
      if (!response.ok) {
        throw new Error('Failed to fetch stocks');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to fetch a specific stock price from Dinari
 */
export function useDinariStockPrice(symbol: string) {
  return useQuery<{
    symbol: string;
    price: number;
  }>({
    queryKey: ['dinari', 'stock', symbol],
    queryFn: async () => {
      const response = await fetch(`/api/dinari/stocks/${symbol}`);
      if (!response.ok) {
        throw new Error('Failed to fetch stock price');
      }
      return response.json();
    },
    staleTime: 1000 * 60, // 1 minute
    enabled: !!symbol,
  });
}

/**
 * Hook to fetch orders from Dinari
 */
export function useDinariOrders() {
  return useQuery<DinariOrder[]>({
    queryKey: ['dinari', 'orders'],
    queryFn: async () => {
      const response = await fetch('/api/dinari/orders');
      if (!response.ok) {
        throw new Error('Failed to fetch orders');
      }
      return response.json();
    },
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Hook to fetch entity details from Dinari
 */
export function useDinariEntity(entityId: string) {
  return useQuery<DinariEntity>({
    queryKey: ['dinari', 'entity', entityId],
    queryFn: async () => {
      const response = await fetch(`/api/dinari/entities/${entityId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch entity');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 10, // 10 minutes
    enabled: !!entityId,
  });
}