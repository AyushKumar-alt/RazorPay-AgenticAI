import { GoogleGenAI, Type, FunctionDeclaration } from '@google/genai';
import { getCart, Cart } from '@/lib/cart/cart.service';
import { executeCatalogTool } from '@/lib/tools/catalog/catalog-tool.registry';
import { CatalogToolName } from '@/lib/tools/catalog/catalog-tool.types';
import { PurchaseProposal } from '@/types/purchase';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { Product } from '@/types/catalog';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OfferedRecommendation {
  productId: string;
  recommendedProductId: string;
  recommendedProductName: string;
  recommendedProductPricePaise: number;
  reason: string;
}

export interface ChatTurnContext {
  message: string;
  history?: ChatMessage[];
  lastOfferedRecommendation?: OfferedRecommendation | null;
  lastAddedProductId?: string | null;
}

export interface ToolTraceRecord {
  step: number;
  tool: CatalogToolName;
  input: unknown;
  resultSummary: string;
}

export interface ChatTurnResult {
  success: boolean;
  text: string;
  cart: Cart;
  toolTrace: ToolTraceRecord[];
  proposal?: PurchaseProposal | null;
  lastOfferedRecommendation?: OfferedRecommendation | null;
  lastAddedProductId?: string | null;
  addedProduct?: Product | null;
  recommendedProduct?: Product | null;
  recommendationReason?: string | null;
}

const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'searchCatalog',
    description: 'Search for products in the catalog by search query string, category, max price in paise, or inStock boolean.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        search: { type: Type.STRING, description: 'Search term query (e.g. "wireless mouse", "water bottle", "backpack")' },
        category: { type: Type.STRING, description: 'Category name (electronics, mobile, audio, fitness, home, fashion, travel, care, office, lifestyle)' },
        maxPricePaise: { type: Type.NUMBER, description: 'Maximum price in paise (₹1 = 100 paise)' },
        inStock: { type: Type.BOOLEAN, description: 'Filter only in-stock items' },
      },
    },
  },
  {
    name: 'getProduct',
    description: 'Get detailed product information by its exact catalog product ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING, description: 'Product ID (e.g. elec_002, bottle_001)' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'addToCart',
    description: 'Add a product to the user\'s shopping cart with a quantity (defaults to 1).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING, description: 'Product ID to add' },
        quantity: { type: Type.NUMBER, description: 'Quantity to add (default 1)' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'removeFromCart',
    description: 'Remove a product from the user\'s shopping cart by product ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING, description: 'Product ID to remove' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'updateCartQuantity',
    description: 'Update the quantity of a product in the cart. Setting quantity to 0 removes the item.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING, description: 'Product ID' },
        quantity: { type: Type.NUMBER, description: 'New quantity' },
      },
      required: ['productId', 'quantity'],
    },
  },
  {
    name: 'getCart',
    description: 'Get the current items and total subtotal in the user\'s shopping cart.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: 'recommendRelatedProducts',
    description: 'Look up recommended partner product / accessory pairing for a product ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        productId: { type: Type.STRING, description: 'Product ID' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'checkoutCart',
    description: 'Initiate purchase proposal checkout for the items in the cart (when user asks to checkout, buy now, pay, or proceed to payment).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        merchantId: { type: Type.STRING, description: 'Merchant ID (default merchant_aquamart)' },
      },
    },
  },
];

export class ChatShoppingService {
  private static MAX_ROUNDS = 5;

  /**
   * Process a single chat turn via Gemini 2.5 Flash function calling.
   */
  public static async processTurn(context: ChatTurnContext): Promise<ChatTurnResult> {
    const userMessage = context.message.trim();
    const history = context.history || [];
    const toolTrace: ToolTraceRecord[] = [];
    let stepCount = 1;
    let createdProposal: PurchaseProposal | null = null;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
      return this.processTurnFallback(userMessage, history);
    }

    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const currentCart = getCart();

    const systemPrompt = `You are an intelligent, agentic AI Shopping Assistant for NovaBazaar.
Your goal is to converse naturally with the user, understand their intent, and manage their shopping cart using available tools.

CURRENT CART STATE:
${JSON.stringify(currentCart)}

RULES YOU MUST STRICTLY FOLLOW:
1. CONVERSATIONAL & INTERACTIVE:
   - Not every user message is a shopping request. Greetings ("Hello", "Hi", "Good morning"), casual talk, and unrelated questions ("what's the weather like") MUST be answered conversationally with ZERO tool calls.
   - If a message does not require modifying or querying the catalog or cart, reply politely without invoking any tools.

2. CART AWARENESS:
   - Inspect CURRENT CART STATE provided above.
   - Do NOT search for or re-add a product that is ALREADY in the cart unless the user explicitly asks for additional units or quantity changes.
   - Recognize items already in the cart when fulfilling follow-up requests.

3. FOLLOW-UP ITEM RESOLUTION:
   - When a user asks to add or remove an item in a follow-up (e.g. "add the mouse pad too", "remove the cable"), inspect the conversation history and current cart items to identify the specific item intended.
   - If the user previously asked for a mouse and you suggested the mouse pad (DuraCable USB-C cable / mobile_004), add mobile_004 specifically when they say "add the mouse pad too". Do NOT re-add the mouse.

4. PAIRED RECOMMENDATIONS:
   - When adding a product to cart, you may call recommendRelatedProducts.
   - If a companion recommendation is found, describe it in your text response with its name, price, and reason, and ask if the user would like to add it.
   - DO NOT auto-add recommended products to the cart. Only call addToCart when the user explicitly confirms adding it.
   - If recommendRelatedProducts returns no recommendation, do NOT mention any error. Just present the added product clearly.

5. CHECKOUT & PAYMENT:
   - When the user asks to "checkout", "buy now", "pay", or "proceed to payment", invoke the checkoutCart tool.

6. PRICE & TOOL INTEGRITY:
   - Stated prices must match actual prices read from tool results.
   - Never claim an item was added or removed without calling the corresponding tool.`;

    // Construct Gemini contents array with history + new turn
    const contents: any[] = [];

    // System instruction passed via initial user/system prompt
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt }],
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Understood. I am ready to assist the user according to your rules.' }],
    });

    // Append past history turns
    for (const h of history) {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      });
    }

    // Append current user message
    contents.push({
      role: 'user',
      parts: [{ text: userMessage }],
    });

    let round = 1;
    let finalAssistantText = '';

    try {
      while (round <= ChatShoppingService.MAX_ROUNDS) {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            tools: [{ functionDeclarations }],
          },
        });

        const candidate = response.candidates?.[0];
        const modelContent = candidate?.content;

        if (!modelContent) {
          finalAssistantText = response.text || 'I apologize, I could not complete your request.';
          break;
        }

        // Add model's turn to conversation trajectory
        contents.push(modelContent);

        // Check if model called any functions
        const functionCalls = (candidate as any)?.functionCalls || (response as any)?.functionCalls;

        if (!functionCalls || functionCalls.length === 0) {
          // Model produced a final text response with no tool calls!
          finalAssistantText = response.text || '';
          break;
        }

        // Execute each function call requested by Gemini
        const functionResponseParts: any[] = [];

        for (const call of functionCalls) {
          const toolName = call.name as CatalogToolName;
          const toolArgs = call.args || {};

          const result = await executeCatalogTool(toolName, toolArgs);

          let summary = 'Executed.';
          if (result.success) {
            if ('cart' in result) {
              summary = `Cart updated: ${result.cart.items.length} items, subtotal: ₹${result.cart.subtotalPaise / 100}`;
            } else if ('products' in result) {
              summary = `Found ${result.count} products.`;
            } else if ('product' in result) {
              summary = `Fetched ${result.product.name} (₹${result.product.pricePaise / 100}).`;
            } else if ('recommendedProduct' in result) {
              summary = `Recommended ${result.recommendedProduct.name} (₹${result.recommendedProduct.pricePaise / 100}).`;
            } else if ('proposal' in result) {
              summary = `Created proposal ${result.proposal.proposalId} for ₹${result.proposal.totalPaise / 100}.`;
              createdProposal = result.proposal;
            }
          } else {
            summary = `Failed (${result.error.code}): ${result.error.message}`;
          }

          toolTrace.push({
            step: stepCount++,
            tool: toolName,
            input: toolArgs,
            resultSummary: summary,
          });

          // Mask/sanitize PRODUCT_NOT_FOUND error for recommendRelatedProducts so Gemini handles it gracefully
          let sanitizedResult: any = result;
          if (!result.success && toolName === 'recommendRelatedProducts') {
            sanitizedResult = {
              success: false,
              message: 'No additional companion recommendation found for this item.',
            };
          }

          functionResponseParts.push({
            functionResponse: {
              name: call.name,
              response: sanitizedResult,
            },
          });
        }

        // Append function response turn back to Gemini
        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });

        round++;
      }
    } catch (apiErr: any) {
      console.warn(
        '[ChatShoppingService] Gemini API call threw an error or access was denied. Falling back to deterministic tool execution handler.',
        apiErr.message || apiErr
      );

      return this.processTurnFallback(userMessage, history);
    }

    return {
      success: true,
      text: finalAssistantText || 'How else can I help you with your shopping today?',
      cart: getCart(),
      toolTrace,
      proposal: createdProposal,
    };
  }

  /**
   * Deterministic fallback handler when Gemini API key is denied/invalid or network fails.
   */
  private static async processTurnFallback(
    userMessage: string,
    history: ChatMessage[]
  ): Promise<ChatTurnResult> {
    const lower = userMessage.toLowerCase();
    const toolTrace: ToolTraceRecord[] = [];
    let stepCount = 1;
    let createdProposal: PurchaseProposal | null = null;

    // 1. Conversational Greeting Check
    const isGreeting =
      /^(hello|hi|hey|good\s+morning|good\s+afternoon|good\s+evening)\b/i.test(userMessage.trim()) &&
      !/\b(mouse|pad|bottle|earbuds|backpack|buy|find|search|show|get|under|cheap|checkout|pay)\b/i.test(userMessage);

    if (isGreeting) {
      return {
        success: true,
        text: 'Hello! I am your AI Shopping Assistant. Tell me what products you are looking for, and I will help manage your cart.',
        cart: getCart(),
        toolTrace: [],
      };
    }

    // 2. Unrelated Non-Shopping Query Check
    const isUnrelated =
      /\b(weather|temperature|joke|capital|who are you|how are you|time)\b/i.test(userMessage) &&
      !/\b(mouse|pad|bottle|cart|buy|add|remove|checkout)\b/i.test(userMessage);

    if (isUnrelated) {
      return {
        success: true,
        text: "I'm your NovaBazaar AI Shopping Assistant. I can help you search for products, manage items in your cart, and proceed to checkout. How can I assist with your shopping today?",
        cart: getCart(),
        toolTrace: [],
      };
    }

    // 3. Checkout Check
    if (/\b(checkout|buy now|pay|proceed to payment)\b/i.test(userMessage)) {
      const checkoutRes = await executeCatalogTool('checkoutCart', { merchantId: 'merchant_aquamart' });
      if (checkoutRes.success && 'proposal' in checkoutRes) {
        createdProposal = checkoutRes.proposal;
        toolTrace.push({
          step: stepCount++,
          tool: 'checkoutCart',
          input: { merchantId: 'merchant_aquamart' },
          resultSummary: `Created proposal ${checkoutRes.proposal.proposalId} for ₹${checkoutRes.proposal.totalPaise / 100}.`,
        });
        return {
          success: true,
          text: `Your purchase proposal (${checkoutRes.proposal.proposalId}) has been generated for ₹${checkoutRes.proposal.totalPaise / 100}. Please review the order details and click Approve Purchase to complete payment.`,
          cart: getCart(),
          toolTrace,
          proposal: createdProposal,
        };
      }
    }

    // 4. Follow-up companion accessory check (e.g. "add the mouse pad too", "add water bottle", etc.)
    const isCompanionAdd = /\b(add|want|get|also|too)\b/i.test(userMessage);
    let targetCompanionId: string | null = null;
    if (/\b(mouse pad|pad)\b/i.test(userMessage)) targetCompanionId = 'elec_007';
    else if (/\b(water bottle|bottle)\b/i.test(userMessage)) targetCompanionId = 'home_007';
    else if (/\b(wrist rest)\b/i.test(userMessage)) targetCompanionId = 'elec_008';
    else if (/\b(headphone stand|stand)\b/i.test(userMessage)) targetCompanionId = 'audio_006';
    else if (/\b(laptop sleeve|sleeve)\b/i.test(userMessage)) targetCompanionId = 'office_007';
    else if (/\b(phone case|case)\b/i.test(userMessage)) targetCompanionId = 'mobile_006';
    else if (/\b(ring light)\b/i.test(userMessage)) targetCompanionId = 'elec_009';
    else if (/\b(travel mug|coffee mug|mug)\b/i.test(userMessage)) targetCompanionId = 'home_008';
    else if (/\b(socks|sports socks)\b/i.test(userMessage)) targetCompanionId = 'fashion_006';
    else if (/\b(yoga blocks|blocks)\b/i.test(userMessage)) targetCompanionId = 'fit_007';

    if (isCompanionAdd && targetCompanionId) {
      const addRes = await executeCatalogTool('addToCart', { productId: targetCompanionId, quantity: 1 });
      if (addRes.success && 'cart' in addRes) {
        const compProd = CatalogService.getProductById(targetCompanionId);
        toolTrace.push({
          step: stepCount++,
          tool: 'addToCart',
          input: { productId: targetCompanionId, quantity: 1 },
          resultSummary: `Cart updated: ${addRes.cart.items.length} items, subtotal: ₹${addRes.cart.subtotalPaise / 100}`,
        });
        return {
          success: true,
          text: `Added ${compProd?.name || 'companion item'} (₹${compProd ? compProd.pricePaise / 100 : 0}) to your cart. Your updated subtotal is ₹${addRes.cart.subtotalPaise / 100}.`,
          cart: getCart(),
          toolTrace,
          addedProduct: compProd,
        };
      }
    }

    // 5. General Search & Add (e.g. "I need a wireless mouse for work", "Do you have Headphone", "I want to buy packing cubes")
    const searchRes = await executeCatalogTool('searchCatalog', { search: userMessage });
    if (searchRes.success && 'products' in searchRes && searchRes.products.length > 0) {
      const foundProd = searchRes.products[0];
      toolTrace.push({
        step: stepCount++,
        tool: 'searchCatalog',
        input: { search: userMessage },
        resultSummary: `Found ${searchRes.products.length} products.`,
      });

      const getRes = await executeCatalogTool('getProduct', { productId: foundProd.id });
      if (getRes.success && 'product' in getRes) {
        toolTrace.push({
          step: stepCount++,
          tool: 'getProduct',
          input: { productId: foundProd.id },
          resultSummary: `Fetched ${foundProd.name} (₹${foundProd.pricePaise / 100}).`,
        });
      }

      const addRes = await executeCatalogTool('addToCart', { productId: foundProd.id, quantity: 1 });
      let updatedCart = getCart();
      if (addRes.success && 'cart' in addRes) {
        updatedCart = addRes.cart;
        toolTrace.push({
          step: stepCount++,
          tool: 'addToCart',
          input: { productId: foundProd.id, quantity: 1 },
          resultSummary: `Cart updated: ${addRes.cart.items.length} items, subtotal: ₹${addRes.cart.subtotalPaise / 100}`,
        });
      }

      let recText = '';
      let recommendedProductObj: Product | null = null;
      let recReasonStr: string | null = null;
      const recRes = await executeCatalogTool('recommendRelatedProducts', { productId: foundProd.id });
      if (recRes.success && 'recommendedProduct' in recRes) {
        recommendedProductObj = recRes.recommendedProduct;
        recReasonStr = recRes.reason;
        toolTrace.push({
          step: stepCount++,
          tool: 'recommendRelatedProducts',
          input: { productId: foundProd.id },
          resultSummary: `Recommended ${recRes.recommendedProduct.name} (₹${recRes.recommendedProduct.pricePaise / 100}).`,
        });
        recText = ` Would you also like to add the ${recRes.recommendedProduct.name} (₹${recRes.recommendedProduct.pricePaise / 100})? ${recRes.reason}`;
      } else {
        toolTrace.push({
          step: stepCount++,
          tool: 'recommendRelatedProducts',
          input: { productId: foundProd.id },
          resultSummary: `Failed (PRODUCT_NOT_FOUND): No companion recommendation found.`,
        });
      }

      return {
        success: true,
        text: `I've added ${foundProd.name} to your cart for ₹${foundProd.pricePaise / 100}.${recText}`,
        cart: updatedCart,
        toolTrace,
        addedProduct: foundProd,
        recommendedProduct: recommendedProductObj,
        recommendationReason: recReasonStr,
      };
    }

    // 6. Multi-turn History Context Resolution fallback
    if (history.length > 0) {
      for (let i = history.length - 1; i >= 0; i--) {
        const hMsg = history[i];
        if (hMsg.role === 'user' && hMsg.content.trim().length > 0) {
          const histSearchRes = await executeCatalogTool('searchCatalog', { search: hMsg.content });
          if (histSearchRes.success && 'products' in histSearchRes && histSearchRes.products.length > 0) {
            const foundProd = histSearchRes.products[0];
            toolTrace.push({
              step: stepCount++,
              tool: 'searchCatalog',
              input: { search: hMsg.content },
              resultSummary: `Resolved from history turn: Found ${foundProd.name}.`,
            });
            const addRes = await executeCatalogTool('addToCart', { productId: foundProd.id, quantity: 1 });
            let updatedCart = getCart();
            if (addRes.success && 'cart' in addRes) {
              updatedCart = addRes.cart;
              toolTrace.push({
                step: stepCount++,
                tool: 'addToCart',
                input: { productId: foundProd.id, quantity: 1 },
                resultSummary: `Cart updated: ${addRes.cart.items.length} items, subtotal: ₹${addRes.cart.subtotalPaise / 100}`,
              });
            }
            let recText = '';
            let recommendedProductObj: Product | null = null;
            let recReasonStr: string | null = null;
            const recRes = await executeCatalogTool('recommendRelatedProducts', { productId: foundProd.id });
            if (recRes.success && 'recommendedProduct' in recRes) {
              recommendedProductObj = recRes.recommendedProduct;
              recReasonStr = recRes.reason;
              recText = ` Would you also like to add the ${recRes.recommendedProduct.name} (₹${recRes.recommendedProduct.pricePaise / 100})? ${recRes.reason}`;
            }
            return {
              success: true,
              text: `I searched NovaBazaar catalog again for your requested item (${foundProd.name}) and added it to your cart for ₹${foundProd.pricePaise / 100}.${recText}`,
              cart: updatedCart,
              toolTrace,
              addedProduct: foundProd,
              recommendedProduct: recommendedProductObj,
              recommendationReason: recReasonStr,
            };
          }
        }
      }
    }

    return {
      success: true,
      text: "I searched NovaBazaar, but couldn't find matching products for your request. Try searching for a wireless mouse, wallet, lunch box, electric kettle, or yoga mat.",
      cart: getCart(),
      toolTrace,
    };
  }
}
