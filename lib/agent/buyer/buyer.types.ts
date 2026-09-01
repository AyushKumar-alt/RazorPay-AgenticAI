import { PurchaseIntent } from '@/lib/intent/intent.schema';
import { CatalogToolName } from '@/lib/tools/catalog/catalog-tool.types';
import { BuyerRecommendation } from './buyer.schema';

export type BuyerAgentErrorCode =
  | 'AGENT_MAX_ROUNDS'
  | 'NO_VALID_RECOMMENDATION'
  | 'INVALID_AGENT_OUTPUT'
  | 'TOOL_EXECUTION_ERROR'
  | 'AI_PROVIDER_ERROR'
  | 'VALIDATION_ERROR';

export interface ToolTraceItem {
  step: number;
  tool: CatalogToolName;
  input: unknown;
  resultSummary: string;
}

export interface BuyerAgentInput {
  intent: PurchaseIntent;
  userMessage?: string;
}

export interface BuyerAgentErrorResponse {
  success: false;
  error: {
    code: BuyerAgentErrorCode;
    message: string;
  };
}

export interface BuyerAgentSuccessResponse {
  success: true;
  recommendation: BuyerRecommendation;
}

export type BuyerAgentResponse = BuyerAgentSuccessResponse | BuyerAgentErrorResponse;
