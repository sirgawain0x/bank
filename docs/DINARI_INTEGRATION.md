# Dinari API Integration Documentation

## Overview

This document describes the integration of Dinari's v2 Enterprise API into the Creative Bank ecosystem, enabling users to purchase, hold, and manage tokenized 1:1 backed US equities (dShares™) directly on the Base network using USDC.

## Architecture

### System Components

1. **Frontend Components**
   - `DinariDashboard` - Main trading interface
   - `DinariStockTrading` - Stock selection and order placement with KYC compliance
   - Custom React hooks for data fetching

2. **Backend API Routes**
   - `/api/dinari/stocks` - Fetch available stocks
   - `/api/dinari/stocks/[symbol]` - Fetch specific stock prices
   - `/api/dinari/entities` - Manage user KYC entities
   - `/api/dinari/orders` - List and create orders

3. **Library Integration**
   - `@dinari/api-sdk` for server-side API communication
   - Custom TypeScript types for Dinari responses

## Implementation Details

### Environment Variables

```env
# Dinari API Integration
DINARI_API_KEY_ID=your_dinari_api_key_id
DINARI_API_SECRET_KEY=your_dinari_api_secret_key
NEXT_PUBLIC_DINARI_ENVIRONMENT=sandbox # or production
```

### Client Initialization

The Dinari client is initialized in `lib/dinari/client.ts`:

```typescript
import Dinari from '@dinari/api-sdk';

export const dinariClient = new Dinari({
  apiKeyID: process.env.DINARI_API_KEY_ID || '',
  apiSecretKey: process.env.DINARI_API_SECRET_KEY || '',
  environment: (process.env.NEXT_PUBLIC_DINARI_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
});
```

### API Routes

All Dinari API calls are made through secure backend routes to protect API credentials:

1. **Stock Data**
   - `GET /api/dinari/stocks` - List all available stocks
   - `GET /api/dinari/stocks/[symbol]` - Get current price for a specific stock

2. **Entity Management (KYC)**
   - `POST /api/dinari/entities` - Create new entity for KYC verification
   - `GET /api/dinari/entities/[id]` - Get entity details and KYC status

3. **Order Management**
   - `GET /api/dinari/orders` - List orders
   - `POST /api/dinari/orders` - Create new order

### Frontend Hooks

Custom React hooks provide easy access to Dinari data:

```typescript
// Fetch available stocks
const { data: stocks, isLoading, error } = useDinariStocks();

// Fetch specific stock price
const { data: stockPrice, isLoading, error } = useDinariStockPrice(symbol);

// Fetch orders
const { data: orders, isLoading, error } = useDinariOrders();

// Fetch entity details (KYC status)
const { data: entity, isLoading, error } = useDinariEntity(entityId);
```

## Security Considerations

1. **API Credentials**: All API keys are stored as environment variables and never exposed to the frontend
2. **Backend Routes**: All Dinari API calls are made through secure backend routes
3. **Wallet Integration**: User wallet connections leverage the existing Crossmint infrastructure
4. **KYC Compliance**: Entity management ensures regulatory compliance with proper user verification
5. **Order Authorization**: Orders can only be placed by users with approved KYC status

## Compliance Requirements

### KYC Verification Process

1. **Entity Creation**: Users must create a Dinari entity with their personal information
2. **Verification Status**: Users must have APPROVED status before placing trades
3. **Wallet Linking**: User wallets must be linked to their Dinari entity
4. **Ongoing Compliance**: Entity status is checked before each trade

### Order Placement Requirements

1. **Approved KYC**: Only users with APPROVED entity status can place orders
2. **Valid Wallet**: Orders must be associated with a verified wallet address
3. **Sufficient Funds**: Users must have sufficient USDC balance for purchases
4. **Market Hours**: Orders can only be placed during market hours

## Future Enhancements

1. **Advanced Order Types**: Implement limit orders, stop-loss orders, etc.
2. **Portfolio Analytics**: Add detailed portfolio tracking and performance metrics
3. **Dividend Management**: Integrate dividend distribution features
4. **Real-time Updates**: Implement WebSocket-based real-time price updates
5. **Multi-Asset Support**: Extend to other tokenized assets beyond stocks

## Troubleshooting

### Common Issues

1. **API Authentication Errors**
   - Verify `DINARI_API_KEY_ID` and `DINARI_API_SECRET_KEY` are correctly set
   - Check that the environment is set to the correct value (`sandbox` or `production`)

2. **KYC Verification Failures**
   - Ensure all required user information is provided during entity creation
   - Check entity status through the Dinari dashboard
   - Contact Dinari support for rejected entities

3. **Order Placement Failures**
   - Verify user has sufficient USDC balance
   - Confirm user has completed KYC requirements
   - Check market hours for the specific asset

### Debugging

Enable debug logging by checking the server console output for detailed error messages and API responses.