import { AIProvider } from './provider';
import { PurchaseIntent, PurchaseIntentSchema } from '@/lib/intent/intent.schema';

export class MockAIProvider implements AIProvider {
  private customHandler?: (message: string, previousIntent?: PurchaseIntent) => PurchaseIntent;

  constructor(customHandler?: (message: string, previousIntent?: PurchaseIntent) => PurchaseIntent) {
    this.customHandler = customHandler;
  }

  public async extractIntent(
    message: string,
    previousIntent?: PurchaseIntent
  ): Promise<PurchaseIntent> {
    if (this.customHandler) {
      return PurchaseIntentSchema.parse(this.customHandler(message, previousIntent));
    }

    const text = message.toLowerCase().trim();

    // Start with previous intent if provided
    const intent: Partial<PurchaseIntent> = previousIntent
      ? JSON.parse(JSON.stringify(previousIntent))
      : {
          constraints: {},
          preferences: {},
          budget: {},
          missingInformation: [],
          confidence: 1.0,
        };

    if (!intent.constraints) intent.constraints = {};
    if (!intent.preferences) intent.preferences = {};
    if (!intent.budget) intent.budget = {};
    if (!intent.missingInformation) intent.missingInformation = [];

    // Ambiguous test case ("Find me a good bottle.")
    if (text === 'find me a good bottle.' || text === 'find me a good bottle') {
      return PurchaseIntentSchema.parse({
        category: 'water_bottle',
        constraints: {},
        preferences: {},
        budget: {},
        missingInformation: ['capacity', 'material', 'budget'],
        confidence: 0.6,
      });
    }

    // Category detection (Specific product terms take priority over general use-case terms like 'office')
    if (text.includes('bottle') || text.includes('hydrator') || text.includes('flask')) {
      intent.category = 'water_bottle';
    } else if (text.includes('yoga') || text.includes('resistance') || text.includes('fitness') || text.includes('dumbbell') || text.includes('skipping')) {
      intent.category = 'fitness';
    } else if (
      text.includes('mouse') ||
      text.includes('earbuds') ||
      text.includes('headphone') ||
      text.includes('keyboard') ||
      text.includes('webcam') ||
      text.includes('hub') ||
      text.includes('charger') ||
      text.includes('adapter') ||
      text.includes('cable') ||
      text.includes('power bank') ||
      text.includes('ssd') ||
      text.includes('speaker') ||
      text.includes('desk light') ||
      text.includes('electronics')
    ) {
      intent.category = 'electronics_accessories';
    } else if (text.includes('backpack') || text.includes('daypack')) {
      intent.category = 'backpack';
    } else if (text.includes('desk pad') || text.includes('cushion') || text.includes('office mat') || (text.includes('office') && !text.includes('mouse'))) {
      intent.category = 'office';
    }

    // Capacity detection (explicitly handle 1l, 1 litre, 750ml, 1.2l)
    if (text.includes('1l') || text.includes('1 litre') || text.includes('1 liter')) {
      intent.constraints.capacity = '1L';
    } else if (text.includes('750ml')) {
      intent.constraints.capacity = '750ml';
    } else if (text.includes('1.2l')) {
      intent.constraints.capacity = '1.2L';
    }

    // Material detection
    if (text.includes('stainless steel') || text.includes('steel') || text.includes('stainless')) {
      intent.constraints.material = 'stainless_steel';
    } else if (text.includes('plastic')) {
      intent.constraints.material = 'plastic';
    }

    // Preferences: useCase
    if (text.includes('travel')) {
      intent.preferences.useCase = 'travel';
    } else if (text.includes('gym')) {
      intent.preferences.useCase = 'gym';
    } else if (text.includes('office')) {
      intent.preferences.useCase = 'office';
    }

    // Money / Budget parsing
    const lakhMatch = text.match(/(?:under|around|budget of|to)?\s*₹?\s*(\d+(?:\.\d+)?)\s*lakh/i);
    if (lakhMatch) {
      const lakhs = parseFloat(lakhMatch[1]);
      intent.budget.maxPaise = Math.round(lakhs * 100000 * 100);
    } else {
      // Look specifically for price amounts with currency symbols or monetary keywords
      const rupeeMatch =
        text.match(/(?:under|around|increase my budget to|budget of|below|less than)\s*₹?\s*(\d{1,3}(?:,\d{3})+|\d+)/i) ||
        text.match(/₹\s*(\d{1,3}(?:,\d{3})+|\d+)/i);

      if (rupeeMatch) {
        const rawAmount = rupeeMatch[1].replace(/,/g, '');
        const amountRupees = parseInt(rawAmount, 10);
        if (!isNaN(amountRupees) && amountRupees > 0) {
          intent.budget.maxPaise = amountRupees * 100;
        }
      }
    }

    return PurchaseIntentSchema.parse(intent);
  }
}
