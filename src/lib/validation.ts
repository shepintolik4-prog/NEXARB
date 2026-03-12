import { z } from 'zod';

export const tradeSchema = z.object({
  symbol: z.string().min(1),
  amount: z.number().positive(),
  spread: z.number().min(-100).max(100),
  buyExchange: z.string().min(1),
  sellExchange: z.string().min(1),
  type: z.enum(['cex', 'tri', 'dex', 'cross']),
  mode: z.enum(['demo', 'real']),
});

export const exchangeConnectSchema = z.object({
  exchange: z.string().min(1),
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
});

export const vipInitiateSchema = z.object({
  plan: z.enum(['week', 'month', 'year']).optional(),
  method: z.enum(['stars', 'ton', 'usd']).optional(),
});

export const vipConfirmSchema = z.object({
  invoiceId: z.string().min(1),
  plan: z.enum(['week', 'month', 'year']).optional(),
  method: z.string().min(1),
});

export const accountUpdateSchema = z.object({
  trade_mode: z.enum(['demo', 'real']).optional(),
  filter_prefs: z.object({
    strategies: z.array(z.string()).optional(),
    networks: z.array(z.string()).optional(),
    exchanges: z.array(z.string()).optional(),
    min_spread: z.number().optional(),
    min_ai_score: z.number().optional(),
    tokens: z.array(z.string()).optional(),
  }).optional(),
  auto_trading: z.boolean().optional(),
  auto_amount: z.number().nonnegative().optional(),
  auto_min_spread: z.number().optional(),
  auto_risk: z.enum(['low', 'medium', 'high']).optional(),
});

export const notificationSchema = z.object({
  message: z.string().min(1).max(1000),
});

export const exchangeDeleteSchema = z.object({
  exchange: z.string().min(1),
});
