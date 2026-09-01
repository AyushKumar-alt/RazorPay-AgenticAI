import { CatalogService } from '@/lib/catalog/catalog.service';
import { AuditService } from '@/lib/audit/audit.service';
import { CreateProposalInputSchema, PurchaseProposalSchema } from './purchase.schema';
import { PurchaseProposal } from '@/types/purchase';

export class PurchaseService {
  private static proposals = new Map<string, PurchaseProposal>();
  private static proposalCounter = 1;
  public static EXPIRATION_MINUTES = 10;

  /**
   * Create a server-side authoritative PurchaseProposal.
   * Client cannot supply unit price, delivery fee, or total amount.
   */
  public static async createPurchaseProposal(
    rawInput: unknown
  ): Promise<{ success: true; proposal: PurchaseProposal } | { success: false; error: { code: string; message: string } }> {
    const parseResult = CreateProposalInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid proposal input: ${parseResult.error.issues.map((i) => i.message).join(', ')}`,
        },
      };
    }

    const { merchantId, productId, quantity } = parseResult.data;

    // 1. Verify merchant
    const merchant = CatalogService.getMerchant(merchantId);
    if (!merchant) {
      return {
        success: false,
        error: {
          code: 'MERCHANT_NOT_FOUND',
          message: `Merchant with ID '${merchantId}' does not exist.`,
        },
      };
    }

    // 2. Verify product
    const product = CatalogService.getProductById(productId);
    if (!product) {
      return {
        success: false,
        error: {
          code: 'PRODUCT_NOT_FOUND',
          message: `Product with ID '${productId}' was not found.`,
        },
      };
    }

    // 3. Verify authoritative stock
    const inventory = CatalogService.checkInventory(productId);
    if (!inventory.available || inventory.stock < quantity) {
      return {
        success: false,
        error: {
          code: 'INSUFFICIENT_STOCK',
          message: `Product '${product.name}' has insufficient stock (${inventory.stock} available, ${quantity} requested).`,
        },
      };
    }

    // 4. Calculate authoritative price & delivery fee using integer paise
    const unitPricePaise = product.pricePaise;
    const deliveryFeePaise = product.deliveryInfo.shippingFeePaise;
    const totalPaise = unitPricePaise * quantity + deliveryFeePaise;

    const createdAtDate = new Date();
    const expiresAtDate = new Date(createdAtDate.getTime() + this.EXPIRATION_MINUTES * 60 * 1000);

    const proposalId = `prop_${Date.now()}_${this.proposalCounter++}`;

    const rawProposal: PurchaseProposal = {
      proposalId,
      merchantId: merchant.id,
      productId: product.id,
      productName: product.name,
      quantity,
      unitPricePaise,
      deliveryFeePaise,
      totalPaise,
      currency: 'INR',
      status: 'PENDING_APPROVAL',
      createdAt: createdAtDate.toISOString(),
      expiresAt: expiresAtDate.toISOString(),
      approvalRequired: true,
    };

    // Validate generated proposal against Zod schema
    const proposal = PurchaseProposalSchema.parse(rawProposal);

    // Save proposal to in-memory store
    this.proposals.set(proposalId, proposal);

    // Record audit event
    AuditService.recordEvent('PROPOSAL_CREATED', proposalId, merchant.id, product.id, {
      quantity,
      unitPricePaise,
      deliveryFeePaise,
      totalPaise,
    });

    return {
      success: true,
      proposal,
    };
  }

  /**
   * Retrieve a proposal by ID with server-side expiration handling.
   */
  public static getProposal(proposalId: string): PurchaseProposal | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return null;

    // Check expiration
    const now = new Date();
    const expiresAt = new Date(proposal.expiresAt);

    if (now > expiresAt && proposal.status === 'PENDING_APPROVAL') {
      proposal.status = 'EXPIRED';
      AuditService.recordEvent('PROPOSAL_EXPIRED', proposal.proposalId, proposal.merchantId, proposal.productId, {
        reason: 'Proposal reached expiration window without human approval.',
      });
    }

    return proposal;
  }

  /**
   * Directly set or update proposal in store (internal helper for tests).
   */
  public static saveProposal(proposal: PurchaseProposal): void {
    this.proposals.set(proposal.proposalId, proposal);
  }

  /**
   * Reset store (used for test teardown).
   */
  public static clearProposals(): void {
    this.proposals.clear();
    this.proposalCounter = 1;
  }
}
