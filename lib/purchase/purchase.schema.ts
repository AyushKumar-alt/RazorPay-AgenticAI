import { z } from 'zod';

export const ProposalStatusEnum = z.enum([
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);

export const ProposalItemSchema = z.object({
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  unitPricePaise: z.number().int().nonnegative(),
  subtotalPaise: z.number().int().nonnegative(),
});

export const CreateProposalInputSchema = z
  .object({
    merchantId: z.string().min(1, 'merchantId is required'),
    productId: z.string().optional(),
    quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10, 'Quantity cannot exceed 10').optional(),
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10, 'Quantity cannot exceed 10'),
        })
      )
      .optional(),
  })
  .refine(
    (data) => (data.productId && data.quantity !== undefined) || (data.items && data.items.length > 0),
    {
      message: 'Either productId + quantity or non-empty items array must be provided',
      path: ['productId'],
    }
  );

export const PurchaseProposalSchema = z
  .object({
    proposalId: z.string().min(1),
    merchantId: z.string().min(1),
    items: z.array(ProposalItemSchema),
    productId: z.string().min(1),
    productName: z.string().min(1),
    quantity: z.number().int().min(1),
    unitPricePaise: z.number().int().nonnegative(),
    deliveryFeePaise: z.number().int().nonnegative(),
    totalPaise: z.number().int().nonnegative(),
    currency: z.literal('INR'),
    status: ProposalStatusEnum,
    createdAt: z.string(),
    expiresAt: z.string(),
    approvalRequired: z.literal(true),
  })
  .refine(
    (data) => {
      const itemsTotal = data.items.reduce((acc, i) => acc + i.subtotalPaise, 0);
      return data.totalPaise === itemsTotal + data.deliveryFeePaise;
    },
    {
      message: 'totalPaise must equal sum of items subtotal + deliveryFeePaise',
      path: ['totalPaise'],
    }
  );

