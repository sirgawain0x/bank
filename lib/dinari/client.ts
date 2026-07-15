import Dinari from '@dinari/api-sdk';

// Initialize the Dinari client
export const dinariClient = new Dinari({
  apiKeyID: process.env.DINARI_API_KEY_ID || '',
  apiSecretKey: process.env.DINARI_API_SECRET_KEY || '',
  environment: (process.env.NEXT_PUBLIC_DINARI_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
});

// Type definitions for Dinari responses
export interface DinariStock {
  id: string;
  symbol: string;
  name: string;
  price: number;
  currency: string;
  last_updated: string;
}

export interface DinariOrder {
  id: string;
  entity_id: string;
  asset_id: string;
  quantity: number;
  order_type: 'BUY' | 'SELL';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  created_at: string;
  updated_at: string;
  total_cost?: number;
  fees?: number;
  filled_quantity?: number;
  average_price?: number;
}

export interface DinariEntity {
  id: string;
  name: string;
  email?: string;
  wallet_address?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  created_at: string;
  updated_at: string;
  kyc_status?: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

export interface DinariWallet {
  id: string;
  address: string;
  chain: string;
  created_at: string;
  is_default?: boolean;
}