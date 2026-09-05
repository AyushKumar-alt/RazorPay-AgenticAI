import { NextRequest, NextResponse } from 'next/server';
import { SYNTHETIC_DATASET } from '@/lib/dataset/synthetic-data.generator';
import { RevenueAgent } from '@/lib/agent/revenue/revenue.agent';
import { evaluateOpportunity } from '@/lib/policy/policy-check';
import { AuditService } from '@/lib/audit/audit.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { opportunityId, transactionId } = body;

    if (!opportunityId || !transactionId || typeof opportunityId !== 'string' || typeof transactionId !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'opportunityId and transactionId are required as non-empty strings.',
          },
        },
        { status: 400 }
      );
    }

    // SECURITY GUARD: Strictly resolve authoritative transaction from server dataset
    const tx = SYNTHETIC_DATASET.find((r) => r.id === transactionId);
    if (!tx) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'TRANSACTION_NOT_FOUND',
            message: `Transaction '${transactionId}' not found in server records.`,
          },
        },
        { status: 404 }
      );
    }

    // Re-run RevenueAgent analysis on authoritative transaction to resolve opportunity
    const agent = new RevenueAgent();
    const analysis = await agent.analyzeTransaction(tx);

    const match = analysis.opportunities.find((o) => o.opportunity.id === opportunityId);
    if (!match) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'OPPORTUNITY_NOT_FOUND',
            message: `Opportunity '${opportunityId}' not found for transaction '${transactionId}'.`,
          },
        },
        { status: 404 }
      );
    }

    const { opportunity: authoritativeOpportunity } = match;

    // Server-side re-evaluation of authoritative opportunity against policy engine
    const policyDecision = evaluateOpportunity(authoritativeOpportunity);

    // SECURITY GUARD: Reject if policy evaluation disallowed the action
    if (!policyDecision.allowed) {
      return NextResponse.json(
        {
          success: false,
          status: 'POLICY_REJECTED',
          error: {
            code: 'POLICY_REJECTED',
            message: 'Opportunity is rejected by deterministic merchant policy bounds.',
          },
          policyDecision,
        },
        { status: 400 }
      );
    }

    // SECURITY GUARD: Ensure only opportunities requiring human approval can be approved manually
    if (!policyDecision.requiresApproval) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'APPROVAL_NOT_REQUIRED',
            message: 'Opportunity is auto-action eligible or does not require human approval.',
          },
          policyDecision,
        },
        { status: 400 }
      );
    }

    // Record Audit Event for Merchant Human Sign-off
    AuditService.recordEvent('REVENUE_OPPORTUNITY_APPROVED', tx.id, 'merchant_aquamart', tx.productId, {
      actor: 'MERCHANT_HUMAN',
      opportunityId: authoritativeOpportunity.id,
      opportunityType: authoritativeOpportunity.type,
      amountPaise: authoritativeOpportunity.amountPaise,
      discountPercent: authoritativeOpportunity.discountPercent,
      confidence: authoritativeOpportunity.confidence,
      reasoning: authoritativeOpportunity.reasoning,
      policyDecision,
      status: 'SIMULATED_APPROVED',
      authorizedAction: 'MERCHANT_EXPLICIT_APPROVAL',
      financialExecutionCalled: false, // Explicitly confirm ZERO financial payment execution
    });

    return NextResponse.json({
      success: true,
      status: 'SIMULATED_APPROVED',
      transactionId: tx.id,
      opportunity: authoritativeOpportunity,
      policyDecision,
      message: 'Opportunity successfully approved by merchant and recorded in audit log. (Simulated execution - no customer charge performed).',
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to process revenue opportunity approval.',
        },
      },
      { status: 500 }
    );
  }
}
