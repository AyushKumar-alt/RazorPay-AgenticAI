import { z } from 'zod';

export const CategoryEnum = z.enum([
  'water_bottle',
  'fitness',
  'electronics_accessories',
  'backpack',
  'office',
]);

export const CapacityEnum = z.enum(['750ml', '1L', '1.2L']);

export const MaterialEnum = z.enum([
  'stainless_steel',
  'plastic',
  'latex',
  'TPE',
  'aluminum',
  'leather',
  'memory_foam',
  'PU Leather',
]);

export const IntentConstraintsSchema = z.object({
  capacity: CapacityEnum.optional(),
  material: MaterialEnum.optional(),
  color: z.string().optional(),
  insulation: z.boolean().optional(),
  inStock: z.boolean().optional(),
});

export const IntentPreferencesSchema = z.object({
  useCase: z.string().optional(),
  features: z.array(z.string()).optional(),
});

export const IntentBudgetSchema = z.object({
  maxPaise: z.number().int().nonnegative().optional(),
  minPaise: z.number().int().nonnegative().optional(),
});

export const PurchaseIntentSchema = z.object({
  category: CategoryEnum.optional(),
  constraints: IntentConstraintsSchema.default({}),
  preferences: IntentPreferencesSchema.default({}),
  budget: IntentBudgetSchema.default({}),
  missingInformation: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(1),
});

export type CategoryType = z.infer<typeof CategoryEnum>;
export type CapacityType = z.infer<typeof CapacityEnum>;
export type MaterialType = z.infer<typeof MaterialEnum>;
export type IntentConstraints = z.infer<typeof IntentConstraintsSchema>;
export type IntentPreferences = z.infer<typeof IntentPreferencesSchema>;
export type IntentBudget = z.infer<typeof IntentBudgetSchema>;
export type PurchaseIntent = z.infer<typeof PurchaseIntentSchema>;
