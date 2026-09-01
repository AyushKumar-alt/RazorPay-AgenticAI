import { GoogleGenAI, Type } from '@google/genai';
import { PurchaseIntent, PurchaseIntentSchema } from '@/lib/intent/intent.schema';
import { executeCatalogTool } from '@/lib/tools/catalog/catalog-tool.registry';
import { CatalogToolName } from '@/lib/tools/catalog/catalog-tool.types';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { Product } from '@/types/catalog';
import { BuyerAgentInput, BuyerAgentResponse, ToolTraceItem } from './buyer.types';
import { BuyerRecommendation, BuyerRecommendationSchema } from './buyer.schema';

export class BuyerAgent {
  private static MAX_TOOL_ROUNDS = 8;

  /**
   * Run the AI Buyer Agent for a given PurchaseIntent and optional user message.
   */
  public async run(
    input: BuyerAgentInput,
    mockToolRunner?: (
      step: number,
      retrievedProductIds: Set<string>,
      retrievedProductsMap: Map<string, Product>
    ) => Promise<{ tool: CatalogToolName; input: unknown } | null | BuyerRecommendation>
  ): Promise<BuyerAgentResponse> {
    try {
      // 1. Validate incoming PurchaseIntent
      const intent = PurchaseIntentSchema.parse(input.intent);

      // Track authoritative product IDs and objects returned by tool calls
      const retrievedProductIds = new Set<string>();
      const retrievedProductsMap = new Map<string, Product>();
      const toolTrace: ToolTraceItem[] = [];

      let rawRecommendation: BuyerRecommendation | null = null;

      // Check for Gemini API key if no mock runner is supplied
      const apiKey = process.env.GEMINI_API_KEY;

      if (mockToolRunner) {
        // Mock execution loop for testing
        let step = 1;
        while (step <= BuyerAgent.MAX_TOOL_ROUNDS) {
          const action = await mockToolRunner(step, retrievedProductIds, retrievedProductsMap);
          if (!action) break;

          if ('tool' in action) {
            // Execute tool
            const toolResult = await executeCatalogTool(action.tool, action.input);

            // Record facts returned by searchCatalog or getProduct
            let summary = 'Tool executed.';
            if (toolResult.success) {
              if ('products' in toolResult) {
                summary = `Returned ${toolResult.count} matching products.`;
                toolResult.products.forEach((p) => {
                  retrievedProductIds.add(p.id);
                  retrievedProductsMap.set(p.id, p);
                });
              } else if ('product' in toolResult) {
                summary = `Retrieved details for product ${toolResult.product.id}.`;
                retrievedProductIds.add(toolResult.product.id);
                retrievedProductsMap.set(toolResult.product.id, toolResult.product);
              } else if ('stock' in toolResult) {
                summary = `Stock for ${toolResult.productId}: ${toolResult.stock} (inStock: ${toolResult.inStock}).`;
              } else if ('pricePaise' in toolResult) {
                summary = `Price for ${toolResult.productId}: ${toolResult.pricePaise} paise.`;
              }
            } else {
              summary = `Error (${toolResult.error.code}): ${toolResult.error.message}`;
            }

            toolTrace.push({
              step,
              tool: action.tool,
              input: action.input,
              resultSummary: summary,
            });

            step++;
          } else {
            // Final recommendation output from mock
            rawRecommendation = action;
            break;
          }
        }

        if (step > BuyerAgent.MAX_TOOL_ROUNDS && !rawRecommendation) {
          return {
            success: false,
            error: {
              code: 'AGENT_MAX_ROUNDS',
              message: `Agent exceeded maximum tool execution rounds (${BuyerAgent.MAX_TOOL_ROUNDS}).`,
            },
          };
        }
      } else {
        if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
          return {
            success: false,
            error: {
              code: 'AI_PROVIDER_ERROR',
              message:
                'GEMINI_API_KEY environment variable is missing or set to placeholder "your_gemini_api_key_here". Please open .env.local and replace it with a valid key from https://aistudio.google.com/',
            },
          };
        }

        // Live Gemini 2.5 Flash execution loop
        const ai = new GoogleGenAI({ apiKey });

        // Automatically construct candidate search args from PurchaseIntent
        const searchInput = {
          merchantId: 'merchant_aquamart',
          category: intent.category,
          maxPricePaise: intent.budget.maxPaise,
          minPricePaise: intent.budget.minPaise,
          capacity: intent.constraints.capacity,
          material: intent.constraints.material,
          color: intent.constraints.color,
          insulation: intent.constraints.insulation,
          inStock: intent.constraints.inStock !== false, // default inStock true
        };

        // Execute initial searchCatalog call
        const searchResult = await executeCatalogTool('searchCatalog', searchInput);
        if (searchResult.success && 'products' in searchResult) {
          searchResult.products.forEach((p) => {
            retrievedProductIds.add(p.id);
            retrievedProductsMap.set(p.id, p);
          });
          toolTrace.push({
            step: 1,
            tool: 'searchCatalog',
            input: searchInput,
            resultSummary: `Returned ${searchResult.count} matching products.`,
          });
        }

        // If category search returns 0 products, try broad search by budget
        if (retrievedProductsMap.size === 0 && intent.category) {
          const fallbackInput = { ...searchInput, category: undefined };
          const fallbackResult = await executeCatalogTool('searchCatalog', fallbackInput);
          if (fallbackResult.success && 'products' in fallbackResult) {
            fallbackResult.products.forEach((p) => {
              retrievedProductIds.add(p.id);
              retrievedProductsMap.set(p.id, p);
            });
            toolTrace.push({
              step: 2,
              tool: 'searchCatalog',
              input: fallbackInput,
              resultSummary: `Returned ${fallbackResult.count} matching products across catalog.`,
            });
          }
        }

        // Send Gemini prompt to evaluate matching candidates
        const availableProductsStr = Array.from(retrievedProductsMap.values())
          .map(
            (p) =>
              `- ID: ${p.id}, Name: "${p.name}", Price: ${p.pricePaise} paise (₹${p.pricePaise / 100}), Stock: ${p.stock}, Attributes: ${JSON.stringify(p.attributes)}, Description: ${p.description}`
          )
          .join('\n');

        const systemPrompt = `You are an AI shopping buyer for AquaMart.
Help identify products that satisfy the user's PurchaseIntent.
You may only rely on product facts returned from catalog tools.
Never invent product IDs, prices, stock, or attributes.
You are READ-ONLY and cannot create orders or spend money.

PurchaseIntent: ${JSON.stringify(intent)}
Retrieved Catalog Products:
${availableProductsStr || 'None found.'}

Return a valid JSON matching this schema:
{
  "success": true,
  "recommendations": [
    { "productId": "bottle_001", "reason": "Detailed grounded explanation..." }
  ],
  "summary": "Summary of recommendation",
  "missingInformation": [],
  "confidence": 0.95
}`;

        let retries = 2;
        let delayMs = 1000;
        let jsonText = '{}';

        while (retries >= 0) {
          try {
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: systemPrompt,
              config: {
                responseMimeType: 'application/json',
              },
            });
            jsonText = response.text || '{}';
            break;
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
              console.warn('[Gemini 503 Fallback] Buyer Agent falling back to grounded candidate evaluation.');
              const candidateProducts = Array.from(retrievedProductsMap.values());
              rawRecommendation = {
                success: true,
                recommendations: candidateProducts.map((p) => ({
                  productId: p.id,
                  reason: `Product matches ${intent.category || 'requested requirements'} within budget (${p.pricePaise / 100} INR).`,
                })),
                summary: candidateProducts.length > 0 ? `Found ${candidateProducts.length} matching products in catalog.` : 'No matching products found.',
                missingInformation: [],
                confidence: 0.9,
                toolTrace,
              };
              break;
            }

            throw err;
          }
        }

        const parsedJson = JSON.parse(jsonText);
        rawRecommendation = BuyerRecommendationSchema.parse({
          ...parsedJson,
          toolTrace,
        });
      }

      if (!rawRecommendation) {
        return {
          success: false,
          error: {
            code: 'NO_VALID_RECOMMENDATION',
            message: 'Agent failed to produce a recommendation.',
          },
        };
      }

      // Attach toolTrace
      rawRecommendation.toolTrace = toolTrace;

      // 2. Application Safety & Grounding Validator
      const validatedRecommendation = this.validateAndGroundRecommendation(
        rawRecommendation,
        intent,
        retrievedProductIds,
        retrievedProductsMap
      );

      return {
        success: true,
        recommendation: validatedRecommendation,
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'TOOL_EXECUTION_ERROR',
          message: err.message || 'An unexpected error occurred during agent execution.',
        },
      };
    }
  }

  /**
   * Deterministic Application Safety & Grounding Validator
   * Enforces product existence, retrieved ID grounding, budget upper/lower bounds, stock availability,
   * capacity, and material constraints.
   */
  private validateAndGroundRecommendation(
    rawRec: BuyerRecommendation,
    intent: PurchaseIntent,
    retrievedProductIds: Set<string>,
    retrievedProductsMap: Map<string, Product>
  ): BuyerRecommendation {
    const validRecommendations: { productId: string; reason: string }[] = [];

    for (const rec of rawRec.recommendations) {
      // 1. Grounding check: Product ID must have been returned by an authoritative tool call!
      if (!retrievedProductIds.has(rec.productId)) {
        console.warn(`[Safety Validator Rejected] Product '${rec.productId}' was not in tool call output.`);
        continue;
      }

      // 2. Product existence check in CatalogService
      const product =
        retrievedProductsMap.get(rec.productId) || CatalogService.getProductById(rec.productId);

      if (!product) {
        console.warn(`[Safety Validator Rejected] Product '${rec.productId}' does not exist in catalog.`);
        continue;
      }

      // 3. Hard Budget Limit Safety Check (Max Price)
      if (intent.budget.maxPaise !== undefined && product.pricePaise > intent.budget.maxPaise) {
        console.warn(
          `[Safety Validator Rejected] Product '${rec.productId}' price (${product.pricePaise} paise) exceeds max budget (${intent.budget.maxPaise} paise).`
        );
        continue;
      }

      // 4. Min Budget Safety Check
      if (intent.budget.minPaise !== undefined && product.pricePaise < intent.budget.minPaise) {
        console.warn(
          `[Safety Validator Rejected] Product '${rec.productId}' price (${product.pricePaise} paise) below min budget (${intent.budget.minPaise} paise).`
        );
        continue;
      }

      // 5. Stock Availability Safety Check
      if (intent.constraints.inStock === true && product.stock <= 0) {
        console.warn(`[Safety Validator Rejected] Product '${rec.productId}' is out of stock (stock: ${product.stock}).`);
        continue;
      }

      // 6. Hard Capacity Constraint Safety Check
      if (
        intent.constraints.capacity &&
        product.attributes.capacity &&
        product.attributes.capacity.toLowerCase() !== intent.constraints.capacity.toLowerCase()
      ) {
        console.warn(
          `[Safety Validator Rejected] Product '${rec.productId}' capacity (${product.attributes.capacity}) violates hard constraint (${intent.constraints.capacity}).`
        );
        continue;
      }

      // 7. Hard Material Constraint Safety Check
      if (
        intent.constraints.material &&
        product.attributes.material &&
        product.attributes.material.toLowerCase() !== intent.constraints.material.toLowerCase()
      ) {
        console.warn(
          `[Safety Validator Rejected] Product '${rec.productId}' material (${product.attributes.material}) violates hard constraint (${intent.constraints.material}).`
        );
        continue;
      }

      // Candidate passed all deterministic application safety checks!
      validRecommendations.push(rec);
    }

    // Build grounded final response
    let finalSummary = rawRec.summary;
    if (validRecommendations.length === 0) {
      finalSummary =
        rawRec.recommendations.length > 0
          ? 'No recommended products passed hard budget, inventory, or attribute constraints.'
          : 'No matching catalog products found for the specified PurchaseIntent.';
    }

    return BuyerRecommendationSchema.parse({
      success: true,
      recommendations: validRecommendations,
      summary: finalSummary,
      missingInformation: rawRec.missingInformation || intent.missingInformation || [],
      confidence: validRecommendations.length > 0 ? rawRec.confidence : 0.5,
      toolTrace: rawRec.toolTrace,
    });
  }
}
