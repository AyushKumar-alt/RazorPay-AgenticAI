import { PurchaseIntent } from '@/lib/intent/intent.schema';

export interface AIProvider {
  extractIntent(message: string, previousIntent?: PurchaseIntent): Promise<PurchaseIntent>;
}
