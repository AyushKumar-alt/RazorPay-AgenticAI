import { AIProvider } from '@/lib/ai/provider';
import { GeminiProvider } from '@/lib/ai/gemini';
import { PurchaseIntent, PurchaseIntentSchema } from './intent.schema';

export class IntentService {
  private provider: AIProvider;

  constructor(provider?: AIProvider) {
    this.provider = provider || new GeminiProvider();
  }

  /**
   * Parse a natural language request into a validated PurchaseIntent.
   * Merges with previousIntent if present.
   */
  public async parseIntent(
    message: string,
    previousIntent?: PurchaseIntent
  ): Promise<PurchaseIntent> {
    if (!message || message.trim() === '') {
      throw new Error('Message cannot be empty or blank.');
    }

    // Validate previousIntent if passed in
    let validatedPreviousIntent: PurchaseIntent | undefined = undefined;
    if (previousIntent) {
      validatedPreviousIntent = PurchaseIntentSchema.parse(previousIntent);
    }

    // Extract raw intent via configured AIProvider
    const extractedIntent = await this.provider.extractIntent(
      message,
      validatedPreviousIntent
    );

    // Ensure final output strictly adheres to PurchaseIntent Zod contract
    const validatedIntent = PurchaseIntentSchema.parse(extractedIntent);

    // Merge logic: ensure previous valid budget and constraints are preserved if not overridden
    if (validatedPreviousIntent) {
      return this.mergeIntents(validatedPreviousIntent, validatedIntent);
    }

    return validatedIntent;
  }

  /**
   * Merge new intent with previous intent safely.
   */
  private mergeIntents(
    previous: PurchaseIntent,
    incoming: PurchaseIntent
  ): PurchaseIntent {
    return PurchaseIntentSchema.parse({
      category: incoming.category || previous.category,
      constraints: {
        ...previous.constraints,
        ...incoming.constraints,
      },
      preferences: {
        ...previous.preferences,
        ...incoming.preferences,
      },
      budget: {
        maxPaise:
          incoming.budget.maxPaise !== undefined
            ? incoming.budget.maxPaise
            : previous.budget.maxPaise,
        minPaise:
          incoming.budget.minPaise !== undefined
            ? incoming.budget.minPaise
            : previous.budget.minPaise,
      },
      missingInformation: incoming.missingInformation || [],
      confidence: incoming.confidence ?? previous.confidence,
    });
  }
}
