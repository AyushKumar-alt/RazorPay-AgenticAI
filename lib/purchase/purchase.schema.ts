import { z } from 'zod';

export const ProposalStatusEnum = z.enum([
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
]);

export const CreateProposalInputSchema = z.object({
  merchantId: z.string().min(1, 'merchantId is required'),
  productId: z.string().min(1, 'productId is required'),
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(10, 'Quantity cannot exceed 10'),
});

export const PurchaseProposalSchema = z.object({
  proposalId: z.string().min(1),
  merchantId: z.string().min(1),
  productId: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
  unitPricePaise: z.number().int().nonnegative(),
  deliveryFeePaise: z.number().int().nonnegative(),
  totalPaise: z.number().int().nonnegative(),
  currency: z.literal('INR'),
  status: ProposalStatusEnum,
  createdAt: z.string(),
  expiresAt: z.string(),
  approvalRequired: z.literal(true),
}).refine(
  (data) => data.totalPaise === data.unitPricePaise * data.quantity + data.deliveryFeePaise,
  {
    message: 'totalPaise must equal (unitPricePaise * quantity) + deliveryFeePaise',
    path: ['totalPaise'],
  }
);
