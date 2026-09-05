import { NextResponse } from 'next/server';
import { SYNTHETIC_DATASET } from '@/lib/dataset/synthetic-data.generator';
import { RevenueAgent } from '@/lib/agent/revenue/revenue.agent';

export async function POST() {
  try {
    const agent = new RevenueAgent();
    const results = [];

    let totalAnalyzed = 0;
    let totalOpportunities = 0;
    let policyRejectedCount = 0;
    let humanApprovalCount = 0;
    let autoActionCount = 0;
    let abstainedCount = 0;

    for (const tx of SYNTHETIC_DATASET) {
      totalAnalyzed++;
      const analysis = await agent.analyzeTransaction(tx);
      results.push({
        transaction: tx,
        analysis,
      });

      if (analysis.abstained) {
        abstainedCount++;
      }

      for (const item of analysis.opportunities) {
        totalOpportunities++;
        if (!item.policyDecision.allowed) {
          policyRejectedCount++;
        } else if (item.policyDecision.requiresApproval) {
          humanApprovalCount++;
        } else {
          autoActionCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalAnalyzed,
        totalOpportunities,
        policyRejectedCount,
        humanApprovalCount,
        autoActionCount,
        abstainedCount,
      },
      results,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err.message || 'Failed to execute revenue analysis.',
        },
      },
      { status: 500 }
    );
  }
}
