import { GoogleGenAI } from '@google/genai';
import { AIProvider } from './provider';
import { PurchaseIntent, PurchaseIntentSchema } from '@/lib/intent/intent.schema';

import { MockAIProvider } from './mock';

export class GeminiProvider implements AIProvider {
  private ai: GoogleGenAI;
  private modelName = 'gemini-2.5-flash';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
      throw new Error(
        'GEMINI_API_KEY is missing or set to placeholder "your_gemini_api_key_here". Please open .env.local and replace it with your key from https://aistudio.google.com/'
      );
    }
    this.ai = new GoogleGenAI({ apiKey: apiKey.trim() });
  }

  public async extractIntent(
    message: string,
    previousIntent?: PurchaseIntent
  ): Promise<PurchaseIntent> {
    const systemPrompt = `You are a purchase intent parser for AquaMart agentic commerce.
Convert the user's natural language shopping request into a structured PurchaseIntent JSON.

TAXONOMY & ATTRIBUTE RULES:
- category MUST be one of: "water_bottle", "fitness", "electronics_accessories", "backpack", "office" (or omit if unknown).
- constraints.capacity MUST be one of: "750ml", "1L", "1.2L" (or omit if not explicitly requested).
- constraints.material MUST be one of: "stainless_steel", "plastic", "latex", "TPE", "aluminum", "leather", "memory_foam" (e.g. "steel" -> "stainless_steel").
- preferences.useCase (e.g. "travel", "gym", "office", "hiking") MUST ONLY be placed inside preferences.useCase. Never place useCase in constraints.

MONEY RULES:
- All money amounts MUST be represented as integer paise (₹1 = 100 paise).
- Examples: ₹1,699 -> 169900, ₹2,000 -> 200000, ₹1.5 lakh -> 15000000, ₹2 lakh -> 20000000.
- Place max price in budget.maxPaise and min price in budget.minPaise.

CONSERVATIVE INFERENCE RULES:
- Do NOT invent missing requirements. If the user says "Find me a good bottle", do NOT invent capacity, material, or budget. Add missing information notes like "specify capacity or budget if needed".
- Explicit hard requirements -> constraints.
- Semantic suggestions/use cases -> preferences.

CONVERSATIONAL CONTEXT:
${previousIntent ? `Previous Intent JSON: ${JSON.stringify(previousIntent)}` : 'No previous intent.'}
If previous intent is provided, update or preserve existing valid constraints and budget unless explicitly modified by the user request.

JSON OUTPUT STRUCTURE:
{
  "category": "water_bottle" | "fitness" | "electronics_accessories" | "backpack" | "office",
  "constraints": {
    "capacity": "1L" | "750ml" | "1.2L",
    "material": "stainless_steel" | "plastic" | ...,
    "color": string,
    "insulation": boolean,
    "inStock": boolean
  },
  "preferences": {
    "useCase": string,
    "features": string[]
  },
  "budget": {
    "maxPaise": number,
    "minPaise": number
  },
  "missingInformation": string[],
  "confidence": number
}`;

    const prompt = `User request: "${message}"`;
    let retries = 2;
    let delayMs = 1000;

    while (retries >= 0) {
      try {
        const response = await this.ai.models.generateContent({
          model: this.modelName,
          contents: `${systemPrompt}\n\n${prompt}`,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const responseText = response.text || '{}';
        const rawJson = JSON.parse(responseText);

        // Validate JSON through Zod schema
        return PurchaseIntentSchema.parse(rawJson);
      } catch (err: any) {
        const errStr = String(err?.message || err).toLowerCase();
        const isTransient =
          errStr.includes('503') ||
          errStr.includes('high demand') ||
          errStr.includes('unavailable') ||
          errStr.includes('unreachable') ||
          errStr.includes('429') ||
          errStr.includes('resource_exhausted') ||
          errStr.includes('fetch') ||
          errStr.includes('network');

        if (isTransient && retries > 0) {
          retries--;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
          continue;
        }

        if (isTransient) {
          console.warn('[Gemini 503 Fallback] High demand detected. Falling back to deterministic Intent Parser.');
          const mockProvider = new MockAIProvider();
          return mockProvider.extractIntent(message, previousIntent);
        }

        if (err instanceof Error) {
          throw new Error(`Gemini Provider Intent Parsing Error: ${err.message}`);
        }
        throw new Error('Gemini Provider Intent Parsing failed.');
      }
    }

    const fallback = new MockAIProvider();
    return fallback.extractIntent(message, previousIntent);
  }
}
