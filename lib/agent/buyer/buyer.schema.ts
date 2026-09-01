import { z } from 'zod';

export const RecommendedProductSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  reason: z.string().min(1, 'reason is required'),
});

export const ToolTraceItemSchema = z.object({
  step: z.number().int().positive(),
  tool: z.string(), // Accepts any catalog tool name or unknown tool string for logging
  input: z.unknown(),
  resultSummary: z.string(),
});

export const BuyerRecommendationSchema = z.object({
  success: z.boolean().default(true),
  recommendations: z.array(RecommendedProductSchema).default([]),
  summary: z.string().default(''),
  missingInformation: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1),
  toolTrace: z.array(ToolTraceItemSchema).default([]),
});

export type RecommendedProduct = z.infer<typeof RecommendedProductSchema>;
export type BuyerRecommendation = z.infer<typeof BuyerRecommendationSchema>;
