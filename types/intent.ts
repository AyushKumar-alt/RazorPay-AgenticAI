import { PurchaseIntent } from '@/lib/intent/intent.schema';

export * from '@/lib/intent/intent.schema';

export interface ParseIntentRequest {
  message: string;
  previousIntent?: PurchaseIntent;
}

export interface ParseIntentResponse {
  success: boolean;
  intent?: PurchaseIntent;
  error?: string;
}
