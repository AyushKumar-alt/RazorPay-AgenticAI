'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { PurchaseIntent } from '@/types/intent';
import { BuyerRecommendation } from '@/lib/agent/buyer/buyer.schema';
import { PurchaseProposal } from '@/types/purchase';
import { Product } from '@/types/catalog';
import { PaymentTransaction, PaymentStatus } from '@/types/payment';
import { formatRupees } from '@/lib/money/money';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { getCart, removeFromCart, updateCartQuantity, Cart } from '@/lib/cart/cart.service';
import { CartPanel } from '@/components/catalog/CartPanel';
import { ChatShoppingPanel } from '@/components/catalog/ChatShoppingPanel';


// Phase 7 imports
import { WebSpeechVoiceProvider } from '@/lib/voice/webspeech.provider';
import { detectWakeWord } from '@/lib/voice/wakeword';
import { SessionService } from '@/lib/session/session.service';
import { AgentSession } from '@/types/agent';
import { AgentHeader, AgentPanel, RevenueRecoveryWidget } from '@/components/agent';
import {
  resolveProductReference,
  classifyUtterance,
} from '@/lib/session/reference-resolver';

const RAZORPAY_CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

const CATEGORY_NAV = [
  { id: 'all', label: 'All Categories' },
  { id: 'electronics', label: 'Electronics' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'audio', label: 'Audio' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'home', label: 'Home & Kitchen' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'travel', label: 'Travel' },
  { id: 'care', label: 'Personal Care' },
  { id: 'office', label: 'Office & Study' },
  { id: 'lifestyle', label: 'Lifestyle' },
];

export default function Home() {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusStep, setStatusStep] = useState<string>('');

  // State pipeline
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);
  const [intent, setIntent] = useState<PurchaseIntent | null>(null);
  const [recommendation, setRecommendation] = useState<BuyerRecommendation | null>(null);
  const [recommendedProductsMap, setRecommendedProductsMap] = useState<Record<string, Product>>({});
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [proposal, setProposal] = useState<PurchaseProposal | null>(null);
  const [proposalLoading, setProposalLoading] = useState(false);

  // Phase 5 Payment State
  const [paymentTransaction, setPaymentTransaction] = useState<PaymentTransaction | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | 'NONE'>('NONE');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState<boolean>(false);

  // Live Cart State Sync
  const [cartState, setCartState] = useState<Cart>(getCart());

  const handleRemoveFromCart = async (productId: string) => {
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', productId }),
      });
      const data = await res.json();
      if (data.cart) {
        setCartState(data.cart);
        return;
      }
    } catch {}
    const updated = removeFromCart(productId);
    setCartState({ ...updated });
  };

  const handleUpdateCartQuantity = async (productId: string, newQty: number) => {
    try {
      const res = await fetch('/api/cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update', productId, quantity: newQty }),
      });
      const data = await res.json();
      if (data.cart) {
        setCartState(data.cart);
        return;
      }
    } catch {}
    const updated = updateCartQuantity(productId, newQty);
    setCartState({ ...updated });
  };

  const handleClearCart = async () => {
    try {
      await fetch('/api/cart', { method: 'DELETE' });
    } catch {}
    setCartState({ items: [], subtotalPaise: 0 });
  };

  const handleCartUpdateFromChat = (newCart: Cart) => {
    setCartState({ ...newCart });
  };

  const safeUpdateSessionState = (newState: any) => {
    if (!session) return;
    try {
      sessionServiceRef.current.updateState(session.sessionId, newState);
      setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
    } catch (e) {
      console.warn(`[Session Notice] Transition to ${newState} skipped:`, e);
    }
  };

  const handleProposalCreatedFromChat = (newProposal: PurchaseProposal) => {
    setProposal(newProposal);
    if (session) {
      sessionServiceRef.current.setProposal(session.sessionId, newProposal);
      safeUpdateSessionState('PROPOSAL_READY');
      safeUpdateSessionState('AWAITING_HUMAN_APPROVAL');
    }
  };

  const handleCheckoutCartFromButton = async () => {
    if (cartState.items.length === 0) return;
    setProposalLoading(true);
    setErrorMsg(null);
    setPaymentTransaction(null);
    setPaymentStatus('NONE');

    safeUpdateSessionState('PRODUCT_SELECTED');
    safeUpdateSessionState('PROPOSAL_READY');
    safeUpdateSessionState('AWAITING_HUMAN_APPROVAL');

    try {
      const propRes = await fetch('/api/purchase/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: 'merchant_aquamart',
          items: cartState.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        }),
      });

      const propData = await propRes.json();
      if (!propData.success) {
        throw new Error(propData.error?.message || 'Failed to create proposal');
      }

      setProposal(propData.proposal);
      if (session) {
        sessionServiceRef.current.setProposal(session.sessionId, propData.proposal);
        setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create proposal.');
    } finally {
      setProposalLoading(false);
    }
  };


  // --- PHASE 7E MULTI-TURN VOICE & SESSION ORCHESTRATION ---
  const sessionServiceRef = useRef<SessionService>(new SessionService());
  const voiceProviderRef = useRef<WebSpeechVoiceProvider | null>(null);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [isVoiceSupported, setIsVoiceSupported] = useState<boolean>(false);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceInputText, setVoiceInputText] = useState<string>('');

  // Initialize AgentSession and VoiceProvider on Client Mount (Voice is strictly optional & isolated)
  useEffect(() => {
    const s = sessionServiceRef.current.createSession('novabazaar_session_001');
    setSession(s);

    if (typeof window !== 'undefined') {
      try {
        const provider = new WebSpeechVoiceProvider({
          lang: 'en-US',
          continuous: false,
          interimResults: true,
        });
        voiceProviderRef.current = provider;
        const supported = provider.isSupported();
        setIsVoiceSupported(supported);
        if (!supported) {
          console.warn('Voice Agent Info: Speech recognition is not supported in this browser. Text-based features remain fully operational.');
        }
      } catch (err) {
        console.warn('Voice Agent Info: Failed to initialize voice provider. Falling back to text-only mode.', err);
        setIsVoiceSupported(false);
      }
    }
  }, []);

  const fetchCategoryProducts = async (cat: string) => {
    try {
      const url = cat === 'all' ? '/api/catalog/products' : `/api/catalog/products?category=${cat}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.products) {
        setCategoryProducts(data.products);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    let ignore = false;
    async function load() {
      const url = activeCategory === 'all' ? '/api/catalog/products' : `/api/catalog/products?category=${activeCategory}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!ignore && data.success && data.products) {
        setCategoryProducts(data.products);
      }
    }
    load();
    return () => {
      ignore = true;
    };
  }, [activeCategory]);

  const handleCategoryClick = (catId: string) => {
    setActiveCategory(catId);
    fetchCategoryProducts(catId);
  };

  // Load Razorpay Checkout Script
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const applyPreset = (promptText: string) => {
    setMessage(promptText);
  };

  // Toggle Voice Recognition & Wake Word Detection for ChatShoppingPanel
  const handleMicToggle = () => {
    if (!voiceProviderRef.current) return;

    if (isListening) {
      voiceProviderRef.current.stopListening();
      setIsListening(false);
      safeUpdateSessionState('IDLE');
      return;
    }

    setIsListening(true);
    safeUpdateSessionState('LISTENING');

    voiceProviderRef.current.startListening(
      (result) => {
        if (!result.transcript) return;

        const wakeWordResult = detectWakeWord(result.transcript);
        const textToProcess = wakeWordResult.isWakeWordDetected
          ? wakeWordResult.remainingText || 'hello'
          : result.transcript;

        if (result.isFinal) {
          setIsListening(false);
          safeUpdateSessionState('PROCESSING');
          setVoiceInputText(textToProcess);
        }
      },
      (error) => {
        setIsListening(false);
        safeUpdateSessionState('IDLE');
        console.warn(
          'Voice Agent Notice (non-blocking fallback to text mode): Voice recognition unavailable.',
          error.message || error.code || error
        );
      }
    );
  };

  // 1. Submit shopping request (Intent Extraction -> AI Buyer Agent via text search form)
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setIntent(null);
    setRecommendation(null);
    setSelectedProduct(null);
    setProposal(null);
    setPaymentTransaction(null);
    setPaymentStatus('NONE');

    try {
      setStatusStep('Searching NovaBazaar catalog...');
      const intentRes = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          previousIntent: intent || undefined,
        }),
      });

      const intentData = await intentRes.json();
      if (!intentData.success) {
        throw new Error(intentData.error || 'Failed to parse shopping request');
      }

      const extractedIntent: PurchaseIntent = intentData.intent;
      setIntent(extractedIntent);

      setStatusStep('Evaluating catalog products...');
      const agentRes = await fetch('/api/agent/buyer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: extractedIntent,
          userMessage: message,
        }),
      });

      const agentData = await agentRes.json();
      if (!agentData.success) {
        throw new Error(agentData.error?.message || 'Catalog product evaluation failed');
      }

      const recs = agentData.recommendation;
      setRecommendation(recs);

      if (recs && recs.recommendations && recs.recommendations.length > 0) {
        const prodMap: Record<string, Product> = {};
        await Promise.all(
          recs.recommendations.map(async (r: any) => {
            try {
              const pRes = await fetch(`/api/catalog/products/${r.productId}`);
              const pData = await pRes.json();
              if (pData.success && pData.product) {
                prodMap[r.productId] = pData.product;
              }
            } catch {
              // ignore
            }
          })
        );
        setRecommendedProductsMap(prodMap);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during search.');
    } finally {
      setLoading(false);
      setStatusStep('');
    }
  };

  // 2. Create Purchase Proposal for selected product
  const handleCreateProposal = async (productId: string) => {
    setProposalLoading(true);
    setErrorMsg(null);
    setPaymentTransaction(null);
    setPaymentStatus('NONE');

    safeUpdateSessionState('PRODUCT_SELECTED');
    safeUpdateSessionState('PROPOSAL_READY');
    safeUpdateSessionState('AWAITING_HUMAN_APPROVAL');

    try {
      const prodRes = await fetch(`/api/catalog/products/${productId}`);
      const prodData = await prodRes.json();
      if (prodData.success) {
        setSelectedProduct(prodData.product);
        if (session) {
          sessionServiceRef.current.setSelectedProduct(session.sessionId, prodData.product);
        }
      }

      const propRes = await fetch('/api/purchase/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: 'merchant_aquamart',
          productId,
          quantity: 1,
        }),
      });

      const propData = await propRes.json();
      if (!propData.success) {
        throw new Error(propData.error?.message || 'Failed to create proposal');
      }

      setProposal(propData.proposal);
      if (session) {
        sessionServiceRef.current.setProposal(session.sessionId, propData.proposal);
        setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create proposal.');
    } finally {
      setProposalLoading(false);
    }
  };

  // 3. Human Approval Gate: Approve Proposal
  const handleApproveProposal = async () => {
    if (!proposal) return;
    setProposalLoading(true);
    try {
      const res = await fetch(`/api/purchase/proposal/${proposal.proposalId}/approve`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to approve proposal');
      }
      setProposal(data.proposal);
      if (session) {
        sessionServiceRef.current.setProposal(session.sessionId, data.proposal);
        setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Approval failed.');
    } finally {
      setProposalLoading(false);
    }
  };

  // 4. Human Approval Gate: Reject Proposal
  const handleRejectProposal = async () => {
    if (!proposal) return;
    setProposalLoading(true);
    try {
      const res = await fetch(`/api/purchase/proposal/${proposal.proposalId}/reject`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error?.message || 'Failed to reject proposal');
      }
      setProposal(data.proposal);
      if (session) {
        sessionServiceRef.current.resetSession(session.sessionId);
        setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Rejection failed.');
    } finally {
      setProposalLoading(false);
    }
  };

  // 5. Phase 5: Initiate Razorpay TEST MODE Payment
  const handleInitiatePayment = async () => {
    if (!proposal || proposal.status !== 'APPROVED') return;
    setPaymentLoading(true);
    setErrorMsg(null);

    if (session) {
      sessionServiceRef.current.updateState(session.sessionId, 'PAYMENT_INITIATED');
      setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
    }

    try {
      const orderRes = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposalId: proposal.proposalId,
        }),
      });

      const orderData = await orderRes.json();
      if (!orderData.success) {
        throw new Error(orderData.error?.message || 'Failed to create Razorpay order');
      }

      const { transaction, keyId } = orderData;
      setPaymentTransaction(transaction);
      setPaymentStatus('PAYMENT_PENDING');

      // Check if using Mock Provider
      if (keyId === 'rzp_test_mock_key' || transaction.razorpayOrderId.startsWith('order_mock_')) {
        if (session) {
          sessionServiceRef.current.updateState(session.sessionId, 'VERIFYING');
          setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
        }

        const mockPaymentId = `pay_mock_${Date.now()}`;
        const verifyRes = await fetch('/api/payment/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transactionId: transaction.transactionId,
            razorpayOrderId: transaction.razorpayOrderId,
            razorpayPaymentId: mockPaymentId,
            razorpaySignature: 'mock_valid_signature',
          }),
});

        const verifyData = await verifyRes.json();
        if (verifyData.success) {
          setPaymentStatus('CAPTURED');
          handleClearCart();
          setPaymentTransaction((prev) =>
            prev ? { ...prev, status: 'CAPTURED', razorpayPaymentId: mockPaymentId } : null
          );
          if (session) {
            sessionServiceRef.current.updateState(session.sessionId, 'CAPTURED');
            setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
          }
        } else {
          setPaymentStatus('VERIFICATION_FAILED');
          setErrorMsg(verifyData.error?.message || 'Payment verification failed');
        }
        setPaymentLoading(false);
        return;
      }

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Failed to load Razorpay Checkout script');
      }

      const options = {
        key: keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_mock_key',
        amount: transaction.amountPaise,
        currency: transaction.currency,
        name: 'NovaBazaar',
        description: proposal.productName,
        order_id: transaction.razorpayOrderId,
        handler: async (response: any) => {
          setPaymentLoading(true);
          if (session) {
            sessionServiceRef.current.updateState(session.sessionId, 'VERIFYING');
            setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
          }
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                transactionId: transaction.transactionId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            });

            const verifyData = await verifyRes.json();
            if (!verifyData.success) {
              setPaymentStatus('VERIFICATION_FAILED');
              setErrorMsg(verifyData.error?.message || 'Payment verification failed');
            } else {
              setPaymentStatus('CAPTURED');
              handleClearCart();
              setPaymentTransaction((prev) =>
                prev ? { ...prev, status: 'CAPTURED', razorpayPaymentId: response.razorpay_payment_id } : null
              );
              if (session) {
                sessionServiceRef.current.updateState(session.sessionId, 'CAPTURED');
                setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
              }
            }
          } catch (err: any) {
            setPaymentStatus('VERIFICATION_FAILED');
            setErrorMsg(err.message || 'Error verifying payment signature.');
          } finally {
            setPaymentLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            setPaymentLoading(false);
          },
        },
        theme: {
          color: '#2563eb',
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setErrorMsg(err.message || 'Payment initiation failed.');
      setPaymentLoading(false);
    }
  };

  // Clear/Delete chat history
  const handleClearChat = () => {
    handleClearCart();
    if (session) {
      sessionServiceRef.current.resetSession(session.sessionId);
      setSession({ ...sessionServiceRef.current.getSession(session.sessionId)! });
    }
    setMessage('');
    setIntent(null);
    setRecommendation(null);
    setSelectedProduct(null);
    setProposal(null);
    setPaymentTransaction(null);
    setPaymentStatus('NONE');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between">
      <div>
        {/* Amazon/Flipkart-style Top Navigation Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-1.5">
                <span className="bg-blue-600 text-white px-2.5 py-0.5 rounded text-base font-extrabold tracking-wide">Nova</span>
                <span className="text-blue-600 font-extrabold">Bazaar</span>
              </Link>

              <nav className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-600">
                <Link href="/" className="text-blue-600 font-semibold">Home</Link>
                <Link href="/catalog" className="hover:text-slate-900 transition">Dev Catalog</Link>
                <Link href="/revenue" className="hover:text-blue-600 font-bold transition text-indigo-600 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-md">Revenue Agent</Link>
              </nav>
            </div>

            {/* PHASE 7E ADAM AGENT HEADER PRESENCE */}
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <AgentHeader
                state={isListening ? 'LISTENING' : session?.state || 'IDLE'}
                isVoiceSupported={isVoiceSupported}
                onMicClick={handleMicToggle}
              />
              <span className="hidden sm:inline text-slate-300">|</span>
              <span className="hidden sm:inline cursor-pointer hover:text-slate-900">Account</span>
              <span className="hidden sm:inline cursor-pointer hover:text-slate-900 font-medium">Cart ({cartState.items.length})</span>
            </div>
          </div>

          {/* Category Navigation Bar */}
          <div className="bg-slate-100 border-t border-slate-200/80">
            <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none">
              {CATEGORY_NAV.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.id)}
                  className={`px-3 py-1 rounded-full whitespace-nowrap font-medium transition cursor-pointer ${
                    activeCategory === cat.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Main Shopping Area */}
        <main className="max-w-6xl mx-auto px-4 py-6">

          {/* PRIMARY SHOPPING INTERFACE: UNIFIED CHAT & VOICE PANEL GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <ChatShoppingPanel
                currentCart={cartState}
                onCartUpdate={handleCartUpdateFromChat}
                onProposalCreated={handleProposalCreatedFromChat}
                isVoiceSupported={isVoiceSupported}
                isListening={isListening}
                voiceState={session?.state || 'IDLE'}
                onMicToggle={handleMicToggle}
                voiceProvider={voiceProviderRef.current}
                voiceInputText={voiceInputText}
                onClearVoiceInputText={() => setVoiceInputText('')}
              />
            </div>
            <div>
              <CartPanel
                cart={cartState}
                onRemoveItem={handleRemoveFromCart}
                onUpdateQuantity={handleUpdateCartQuantity}
                onClearCart={handleClearCart}
                onCheckout={handleCheckoutCartFromButton}
              />
            </div>
          </div>

          {/* Configuration / Error Callout Banner */}
          {errorMsg && (
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span>⚠️ Configuration Required</span>
              </div>
              <p>{errorMsg}</p>
              {errorMsg.includes('GEMINI_API_KEY') && (
                <div className="mt-2 p-2.5 rounded bg-white border border-red-200 font-mono text-[11px] text-slate-700 space-y-1">
                  <p className="font-bold text-slate-900">How to fix:</p>
                  <p>1. Open <code className="bg-slate-100 px-1 rounded">.env.local</code> in the root directory.</p>
                  <p>2. Add your key from <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer" className="text-blue-600 underline">Google AI Studio</a>:</p>
                  <p className="font-bold text-slate-900 bg-slate-100 p-1.5 rounded">GEMINI_API_KEY=AIzaSy...</p>
                  <p>3. Restart dev server (<code className="bg-slate-100 px-1 rounded">npm run dev</code>).</p>
                </div>
              )}
            </div>
          )}

          {/* SECTION 1: Shopping Requirements */}
          {intent && (
            <div className="mb-6 bg-white rounded-lg border border-slate-200 p-4">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Your Shopping Requirements
              </h3>

              <div className="flex flex-wrap gap-2 text-xs">
                {intent.category && (
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                    Category: <strong className="text-slate-900">{intent.category.replace('_', ' ')}</strong>
                  </span>
                )}
                {intent.constraints.capacity && (
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                    Capacity: <strong className="text-slate-900">{intent.constraints.capacity}</strong>
                  </span>
                )}
                {intent.constraints.material && (
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-800 border border-slate-200 font-medium">
                    Material: <strong className="text-slate-900">{intent.constraints.material.replace('_', ' ')}</strong>
                  </span>
                )}
                {intent.budget.maxPaise !== undefined && (
                  <span className="px-2.5 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold">
                    Budget: Up to {formatRupees(intent.budget.maxPaise)}
                  </span>
                )}
                {intent.preferences.useCase && (
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                    Use Case: {intent.preferences.useCase}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* SECTION 2: Recommended Products */}
          {recommendation && (
            <div className="mb-8 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">
                  Recommended Products ({recommendation.recommendations.length})
                </h2>

                {recommendation.toolTrace && recommendation.toolTrace.length > 0 && (
                  <button
                    onClick={() => setShowTrace(!showTrace)}
                    className="text-xs text-slate-500 hover:text-blue-600 underline font-medium transition cursor-pointer"
                  >
                    {showTrace ? 'Hide developer details' : 'Developer details'}
                  </button>
                )}
              </div>

              {/* Technical Trace Modal/Drawer */}
              {showTrace && (
                <div className="p-3 rounded bg-slate-900 text-slate-200 text-xs font-mono space-y-1.5">
                  <div className="text-slate-400 font-bold border-b border-slate-800 pb-1">
                    Catalog Tool Trace ({recommendation.toolTrace.length} calls)
                  </div>
                  {recommendation.toolTrace.map((trace) => (
                    <div key={trace.step} className="text-slate-300">
                      Step {trace.step}: <span className="text-cyan-400">{trace.tool}()</span> — {trace.resultSummary}
                    </div>
                  ))}
                </div>
              )}

              {/* Product Cards Grid */}
              {recommendation.recommendations.length === 0 ? (
                <div className="p-8 bg-white rounded-lg border border-slate-200 text-center text-slate-600 text-sm">
                  {recommendation.summary}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {recommendation.recommendations.map((rec) => {
                    const prod = recommendedProductsMap[rec.productId];
                    const prodName = prod ? prod.name : rec.productId;
                    const priceStr = prod ? formatRupees(prod.pricePaise) : 'Authoritative Price';
                    const deliveryStr = prod ? `+${formatRupees(prod.deliveryInfo.shippingFeePaise)} delivery` : 'Delivery calculated at proposal';
                    const imgUrl = prod?.imageUrl || '/products/electronics/usb-c-hub.png';

                    return (
                      <div
                        key={rec.productId}
                        className="bg-white rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-md transition p-5 flex flex-col justify-between"
                      >
                        <div>
                          {/* Real Photographic Product Image */}
                          <div className="w-full h-44 bg-slate-50 rounded mb-4 flex items-center justify-center p-2 border border-slate-200/60 overflow-hidden">
                            <img
                              src={imgUrl}
                              alt={prodName}
                              className="max-h-full max-w-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLElement).setAttribute('src', '/products/electronics/usb-c-hub.png');
                              }}
                            />
                          </div>

                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              In Stock
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">ID: {rec.productId}</span>
                          </div>

                          <h3 className="text-base font-bold text-slate-900 mb-1 leading-snug">
                            {prodName}
                          </h3>

                          {/* Attributes Summary Line */}
                          {prod?.attributes && (
                            <p className="text-xs text-slate-500 mb-3">
                              {prod.attributes.capacity && <span>{prod.attributes.capacity} · </span>}
                              {prod.attributes.material && <span className="capitalize">{String(prod.attributes.material).replace('_', ' ')} · </span>}
                              {prod.attributes.color && <span>{prod.attributes.color}</span>}
                            </p>
                          )}

                          {/* Matching Explanation */}
                          <div className="bg-slate-50 p-3 rounded border border-slate-200/80 mb-4">
                            <span className="text-xs font-bold text-slate-700 block mb-0.5">Why this matches:</span>
                            <p className="text-xs text-slate-600 leading-normal">{rec.reason}</p>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-baseline justify-between pt-3 border-t border-slate-100 mb-3">
                            <span className="text-2xl font-black text-slate-900">
                              {priceStr}
                            </span>
                            <span className="text-xs text-slate-500 font-medium">{deliveryStr}</span>
                          </div>

                          <button
                            onClick={() => handleCreateProposal(rec.productId)}
                            disabled={proposalLoading}
                            className="w-full py-2.5 px-4 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition shadow-xs cursor-pointer"
                          >
                            {proposalLoading && selectedProduct?.id === rec.productId
                              ? 'Creating Proposal...'
                              : 'Request Purchase →'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* DEFAULT CATALOG DISPLAY (When no AI search active) */}
          {!recommendation && (
            <div className="mb-8 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 capitalize">
                  {activeCategory === 'all' ? 'All Products' : `${activeCategory} Products`} ({categoryProducts.length})
                </h2>
                <span className="text-xs text-slate-500">NovaBazaar Curated Catalog</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {categoryProducts.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-md transition p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="w-full h-36 bg-slate-50 rounded mb-3 flex items-center justify-center p-2 border border-slate-200/60 overflow-hidden">
                        <img
                          src={product.imageUrl || '/products/electronics/usb-c-hub.png'}
                          alt={product.name}
                          className="max-h-full max-w-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).setAttribute('src', '/products/electronics/usb-c-hub.png');
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-slate-400 uppercase">{product.category}</span>
                        {product.stock > 0 ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            In Stock
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                            Out of Stock
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 mb-1 leading-snug line-clamp-2">{product.name}</h3>
                      <p className="text-xs text-slate-500 mb-3 line-clamp-2">{product.description}</p>
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between pt-2 border-t border-slate-100 mb-3">
                        <span className="text-lg font-black text-slate-900">{formatRupees(product.pricePaise)}</span>
                        <span className="text-[10px] text-slate-500">+₹{product.deliveryInfo.shippingFeePaise / 100}</span>
                      </div>

                      <button
                        onClick={() => handleCreateProposal(product.id)}
                        disabled={proposalLoading || product.stock <= 0}
                        className="w-full py-2 px-3 text-xs font-bold rounded bg-slate-900 hover:bg-blue-600 disabled:opacity-50 text-white transition cursor-pointer"
                      >
                        {product.stock <= 0 ? 'Out of Stock' : 'Select Product'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 3: Purchase Review & Human Approval Screen */}
          {proposal && (
            <div className="mb-8 bg-white rounded-lg border border-slate-300 p-6 md:p-8 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Review Your Purchase
                  </h3>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    Proposal ID: {proposal.proposalId} · Merchant: NovaBazaar
                  </p>
                </div>

                <div>
                  {proposal.status === 'PENDING_APPROVAL' && (
                    <span className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold text-xs">
                      Status: Pending Approval
                    </span>
                  )}
                  {proposal.status === 'APPROVED' && (
                    <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-xs">
                      Status: Approved
                    </span>
                  )}
                  {proposal.status === 'REJECTED' && (
                    <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-semibold text-xs">
                      Status: Rejected
                    </span>
                  )}
                </div>
              </div>

              {/* Itemized Order Review Table */}
              <div className="border border-slate-200 rounded-md overflow-hidden text-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/70 text-xs font-semibold text-slate-700">
                      <th className="p-3">Product</th>
                      <th className="p-3 text-center">Qty</th>
                      <th className="p-3 text-right">Unit Price</th>
                      <th className="p-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {proposal.items && proposal.items.length > 0 ? (
                      proposal.items.map((item) => (
                        <tr key={item.productId}>
                          <td className="p-3 font-medium text-slate-900">{item.productName}</td>
                          <td className="p-3 text-center text-slate-700 font-semibold">{item.quantity}</td>
                          <td className="p-3 text-right font-mono text-slate-700">{formatRupees(item.unitPricePaise)}</td>
                          <td className="p-3 text-right font-mono text-slate-900 font-semibold">{formatRupees(item.subtotalPaise)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="p-3 font-medium text-slate-900">{proposal.productName}</td>
                        <td className="p-3 text-center text-slate-700 font-semibold">{proposal.quantity}</td>
                        <td className="p-3 text-right font-mono text-slate-700">{formatRupees(proposal.unitPricePaise)}</td>
                        <td className="p-3 text-right font-mono text-slate-900 font-semibold">{formatRupees(proposal.unitPricePaise * proposal.quantity)}</td>
                      </tr>
                    )}
                    <tr className="bg-slate-50 border-t border-slate-200 font-medium">
                      <td colSpan={3} className="p-3 text-slate-600 text-right">Delivery Fee:</td>
                      <td className="p-3 text-right font-mono text-slate-900 font-semibold">{formatRupees(proposal.deliveryFeePaise)}</td>
                    </tr>
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                      <td colSpan={3} className="p-4 text-slate-900 text-base">Total Order Value</td>
                      <td className="p-4 text-blue-600 text-xl font-black text-right">
                        {formatRupees(proposal.totalPaise)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Human Approval Controls */}
              {proposal.status === 'PENDING_APPROVAL' && (
                <div className="p-4 bg-slate-50 rounded-md border border-slate-200 space-y-3">
                  <p className="text-xs text-slate-600">
                    Review proposal details. Authorizing this purchase allows proceeding to payment execution.
                  </p>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleApproveProposal}
                      disabled={proposalLoading}
                      className="px-6 py-2.5 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-xs cursor-pointer"
                    >
                      Approve Purchase
                    </button>

                    <button
                      onClick={handleRejectProposal}
                      disabled={proposalLoading}
                      className="px-4 py-2.5 text-xs font-medium rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}

              {/* SECTION 4: Payment Button (Only when APPROVED) */}
              {proposal.status === 'APPROVED' && paymentStatus !== 'CAPTURED' && (
                <div className="p-5 bg-blue-50/60 rounded-md border border-blue-200 space-y-3">
                  <div className="text-xs text-blue-900">
                    <strong className="font-bold block text-sm mb-0.5">Purchase Approved</strong>
                    Your purchase has been authorized. Payment has not been completed yet.
                  </div>

                  <button
                    onClick={handleInitiatePayment}
                    disabled={paymentLoading}
                    className="px-6 py-3 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition shadow-xs cursor-pointer flex items-center gap-2"
                  >
                    {paymentLoading ? (
                      <span>Opening Razorpay...</span>
                    ) : (
                      <span>Pay {formatRupees(proposal.totalPaise)}</span>
                    )}
                  </button>
                </div>
              )}

              {/* SECTION 5: Payment Verified & Completed UI */}
              {paymentStatus === 'CAPTURED' && (
                <div className="p-6 bg-emerald-50/80 rounded-md border border-emerald-300 text-slate-900 space-y-4">
                  <div className="flex items-center justify-between border-b border-emerald-200 pb-3">
                    <div>
                      <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider block">
                        ✓ Payment Verified
                      </span>
                      <h4 className="text-xl font-bold text-slate-900">
                        Order Authorized Successfully
                      </h4>
                    </div>
                    <span className="px-2.5 py-1 font-mono text-xs font-semibold bg-emerald-100 text-emerald-800 rounded border border-emerald-300">
                      CAPTURED
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono bg-white p-4 rounded border border-emerald-200">
                    <div>
                      <span className="text-slate-500 block">Transaction ID:</span>
                      <span className="text-slate-900 font-bold">{paymentTransaction?.transactionId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Razorpay Order ID:</span>
                      <span className="text-slate-800">{paymentTransaction?.razorpayOrderId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Razorpay Payment ID:</span>
                      <span className="text-emerald-700 font-bold">{paymentTransaction?.razorpayPaymentId}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Verified Amount:</span>
                      <span className="text-blue-600 font-bold">{formatRupees(proposal.totalPaise)}</span>
                    </div>
                  </div>

                  {/* Clean Lifecycle Audit Breadcrumb */}
                  <div className="pt-2 text-xs font-medium text-slate-600">
                    <span className="font-bold text-slate-700 block mb-1">Transaction Lifecycle Audit:</span>
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">1. Search</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">2. Proposal</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-200 text-amber-800">3. Approved</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-blue-100 border border-blue-200 text-blue-800">4. Razorpay Order</span>
                      <span>→</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold">5. HMAC Verified</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Merchant Agentic Revenue Recovery Section */}
          <div className="mt-12 pt-8 border-t border-slate-200">
            <h2 className="text-center text-lg font-bold text-slate-900 mb-2">
              Merchant Revenue Recovery Dashboard
            </h2>
            <p className="text-center text-xs text-slate-500 max-w-xl mx-auto mb-4">
              Autonomous AI Revenue Agent identifying recoverable failed payments and generating Razorpay payment collection links under Policy Engine governance.
            </p>
            <RevenueRecoveryWidget />
          </div>

        </main>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto px-4">
          NovaBazaar Commerce Platform
        </div>
      </footer>
    </div>
  );
}
