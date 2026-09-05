'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Cart } from '@/lib/cart/cart.service';
import { OfferedRecommendation, ToolTraceRecord } from '@/lib/agent/buyer/chat-shopping.service';
import { PurchaseProposal } from '@/types/purchase';
import { Product } from '@/types/catalog';
import { WebSpeechVoiceProvider } from '@/lib/voice/webspeech.provider';
import { AgentSessionState } from '@/types/agent';
import { AgentVoiceOrb } from '@/components/agent/AgentVoiceOrb';

export interface ChatDisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolTrace?: ToolTraceRecord[];
  timestamp: string;
  addedProduct?: Product | null;
  recommendedProduct?: Product | null;
  recommendationReason?: string | null;
}

interface ChatShoppingPanelProps {
  onCartUpdate: (newCart: Cart) => void;
  currentCart: Cart;
  onProposalCreated?: (proposal: PurchaseProposal) => void;
  isVoiceSupported?: boolean;
  isListening?: boolean;
  voiceState?: AgentSessionState;
  onMicToggle?: () => void;
  voiceProvider?: WebSpeechVoiceProvider | null;
  voiceInputText?: string;
  onClearVoiceInputText?: () => void;
}

export const ChatShoppingPanel: React.FC<ChatShoppingPanelProps> = ({
  onCartUpdate,
  currentCart,
  onProposalCreated,
  isVoiceSupported = false,
  isListening = false,
  voiceState = 'IDLE',
  onMicToggle,
  voiceProvider,
  voiceInputText,
  onClearVoiceInputText,
}) => {
  const initialWelcomeMsg: ChatDisplayMessage = {
    id: 'welcome',
    role: 'assistant',
    content:
      'Hello! I am Adam, your AI Shopping Assistant. Tell me what products you are looking for (e.g. "I need a wireless mouse for work", "ordering a lunch box", "what\'s in my cart"), and I will help manage your cart and recommend paired companion accessories.',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  };

  const [messages, setMessages] = useState<ChatDisplayMessage[]>([initialWelcomeMsg]);
  const [inputMessage, setInputMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastOfferedRec, setLastOfferedRec] = useState<OfferedRecommendation | null>(null);
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep latest message in view
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isProcessing]);

  // Handle incoming voice transcript from parent voice handler
  useEffect(() => {
    if (voiceInputText && voiceInputText.trim() && !isProcessing) {
      handleSendMessage(voiceInputText.trim());
      if (onClearVoiceInputText) {
        onClearVoiceInputText();
      }
    }
  }, [voiceInputText]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = (customText || inputMessage).trim();
    if (!textToSend || isProcessing) return;

    const userMsg: ChatDisplayMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsProcessing(true);

    try {
      const res = await fetch('/api/agent/buyer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          lastOfferedRecommendation: lastOfferedRec,
          lastAddedProductId: lastAddedId,
        }),
      });

      const data = await res.json();

      if (data.cart) {
        onCartUpdate(data.cart);
      }

      if (data.proposal) {
        onProposalCreated?.(data.proposal);
      }

      if (data.lastOfferedRecommendation !== undefined) {
        setLastOfferedRec(data.lastOfferedRecommendation);
      }
      if (data.lastAddedProductId !== undefined) {
        setLastAddedId(data.lastAddedProductId);
      }

      const responseText = data.text || 'Turn completed.';

      const assistantMsg: ChatDisplayMessage = {
        id: `asst_${Date.now()}`,
        role: 'assistant',
        content: responseText,
        toolTrace: data.toolTrace || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        addedProduct: data.addedProduct || null,
        recommendedProduct: data.recommendedProduct || null,
        recommendationReason: data.recommendationReason || null,
      };

      setMessages((prev) => [...prev, assistantMsg]);

      // Speak single authoritative response via TTS if voiceProvider is available
      if (voiceProvider) {
        voiceProvider.speak(responseText);
      }
    } catch (err: any) {
      const errorMsgText = `Error: ${err.message || 'Failed to process chat request.'}`;
      const errorMsg: ChatDisplayMessage = {
        id: `err_${Date.now()}`,
        role: 'assistant',
        content: errorMsgText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePresetClick = (presetText: string) => {
    if (isProcessing) return;
    setInputMessage(presetText);
    handleSendMessage(presetText);
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `welcome_${Date.now()}`,
        role: 'assistant',
        content: 'Chat history cleared. How can I help you today?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col h-[600px]">
      {/* Unified Header with Integrated Voice Controls */}
      <div className="p-4 border-b border-slate-200 bg-slate-900 text-white rounded-t-lg flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AgentVoiceOrb state={isListening ? 'LISTENING' : isProcessing ? 'PROCESSING' : voiceState} size="sm" />
          <div>
            <h2 className="text-sm font-bold flex items-center gap-2">
              <span>Adam — AI Shopping Assistant</span>
            </h2>
            <p className="text-[11px] text-slate-400">
              {isListening
                ? '🎙️ Listening... Speak your request'
                : isProcessing
                ? '⚙️ Processing catalog tools...'
                : 'Tool-Driven Shopping & Voice Agent'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Voice Mic Toggle Button */}
          <button
            type="button"
            onClick={onMicToggle}
            disabled={!isVoiceSupported}
            className={`px-3 py-1.5 rounded-full transition-all focus:outline-none cursor-pointer flex items-center gap-1.5 text-xs font-semibold ${
              isListening
                ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md'
                : isVoiceSupported
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            title={
              isVoiceSupported
                ? isListening
                  ? 'Click to stop listening'
                  : 'Click to start voice mode (or say "Hey Adam")'
                : 'Voice input not supported in browser'
            }
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"
              />
            </svg>
            <span>{isListening ? 'Listening' : 'Voice'}</span>
          </button>

          {/* Clear Chat Button */}
          <button
            type="button"
            onClick={handleClearChat}
            className="p-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer"
            title="Clear chat history"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-slate-50 text-xs">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] rounded-lg p-3 shadow-xs whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-blue-600 text-white font-medium rounded-br-none'
                  : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
              }`}
            >
              <div>{msg.content}</div>

              {/* Visual Display Cards for Main Added Product and Recommended Companion Product */}
              {msg.role === 'assistant' && (msg.addedProduct || msg.recommendedProduct) && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                  {/* Main Product Card */}
                  {msg.addedProduct && (
                    <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200 flex items-center gap-3">
                      {msg.addedProduct.imageUrl && (
                        <img
                          src={msg.addedProduct.imageUrl}
                          alt={msg.addedProduct.name}
                          className="w-12 h-12 rounded object-cover border border-emerald-300 bg-white shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-600 text-white uppercase">
                            Added to Cart
                          </span>
                          <span className="text-[10px] text-emerald-700 font-medium capitalize">
                            {msg.addedProduct.category}
                          </span>
                        </div>
                        <h4 className="font-semibold text-slate-900 text-xs mt-0.5 truncate">
                          {msg.addedProduct.name}
                        </h4>
                        <div className="font-bold text-emerald-800 text-xs mt-0.5">
                          ₹{(msg.addedProduct.pricePaise / 100).toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recommended Companion Product Card */}
                  {msg.recommendedProduct && (
                    <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        {msg.recommendedProduct.imageUrl && (
                          <img
                            src={msg.recommendedProduct.imageUrl}
                            alt={msg.recommendedProduct.name}
                            className="w-14 h-14 rounded object-cover border border-amber-300 bg-white shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-600 text-white uppercase tracking-wider">
                              AI Recommended Pairing ✨
                            </span>
                            <span className="text-[10px] text-amber-800 font-medium capitalize">
                              {msg.recommendedProduct.category}
                            </span>
                          </div>
                          <h4 className="font-bold text-slate-900 text-xs mt-0.5 truncate">
                            {msg.recommendedProduct.name}
                          </h4>
                          <div className="font-extrabold text-amber-900 text-xs mt-0.5">
                            ₹{(msg.recommendedProduct.pricePaise / 100).toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>

                      {msg.recommendationReason && (
                        <p className="text-[11px] text-amber-900/90 italic bg-amber-100/60 p-1.5 rounded border border-amber-200/60">
                          💡 {msg.recommendationReason}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSendMessage(`add ${msg.recommendedProduct?.name}`)}
                        disabled={isProcessing}
                        className="w-full py-1.5 px-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold rounded-md transition shadow-xs cursor-pointer flex items-center justify-center gap-1 mt-1"
                      >
                        ➕ Add Recommended {msg.recommendedProduct.name.split(' ')[0]} (₹{(msg.recommendedProduct.pricePaise / 100).toLocaleString('en-IN')})
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tool Trace Output (Developer Details) */}
            {msg.toolTrace && msg.toolTrace.length > 0 && (
              <div className="mt-1.5 max-w-[90%] bg-slate-900 text-slate-300 p-2 rounded text-[10px] font-mono space-y-1">
                <div className="text-slate-400 font-bold border-b border-slate-800 pb-0.5">
                  Executed Tools ({msg.toolTrace.length}):
                </div>
                {msg.toolTrace.map((t) => (
                  <div key={t.step} className="truncate">
                    <span className="text-cyan-400">{t.tool}()</span> → {t.resultSummary}
                  </div>
                ))}
              </div>
            )}

            <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.timestamp}</span>
          </div>
        ))}

        {/* Lightweight Processing Indicator */}
        {isProcessing && (
          <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-blue-200 text-blue-700 text-xs max-w-[70%] animate-pulse">
            <div className="flex space-x-1">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" />
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
            <span className="font-medium">Executing cart tools & catalog lookup...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Prompt Chips */}
      <div className="px-4 py-2 border-t border-slate-100 bg-white flex items-center gap-1.5 overflow-x-auto text-[11px] scrollbar-none">
        <span className="text-slate-400 font-medium whitespace-nowrap">Try:</span>
        <button
          onClick={() => handlePresetClick('I need a wireless mouse for work')}
          disabled={isProcessing}
          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 whitespace-nowrap transition cursor-pointer border border-slate-200"
        >
          Wireless mouse
        </button>
        <button
          onClick={() => handlePresetClick('add the mouse pad too')}
          disabled={isProcessing}
          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 whitespace-nowrap transition cursor-pointer border border-slate-200"
        >
          Add mouse pad
        </button>
        <button
          onClick={() => handlePresetClick('I am ordering a lunch box')}
          disabled={isProcessing}
          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 whitespace-nowrap transition cursor-pointer border border-slate-200"
        >
          Lunch box
        </button>
        <button
          onClick={() => handlePresetClick('add water bottle')}
          disabled={isProcessing}
          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 whitespace-nowrap transition cursor-pointer border border-slate-200"
        >
          Add water bottle
        </button>
        <button
          onClick={() => handlePresetClick('I want a mechanical keyboard')}
          disabled={isProcessing}
          className="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 whitespace-nowrap transition cursor-pointer border border-slate-200"
        >
          Mechanical keyboard
        </button>
      </div>

      {/* Unified Input Area */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="p-3 border-t border-slate-200 bg-white rounded-b-lg flex items-center gap-2"
      >
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder={
            isListening
              ? '🎙️ Listening... speak now or type...'
              : isProcessing
              ? 'Adam is processing...'
              : 'Type a shopping request...'
          }
          disabled={isProcessing}
          className="flex-1 px-4 py-2.5 rounded-md bg-slate-50 border border-slate-300 text-slate-900 text-xs placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white disabled:opacity-50"
        />

        {/* Quick Mic Button inside input bar */}
        {onMicToggle && (
          <button
            type="button"
            onClick={onMicToggle}
            disabled={!isVoiceSupported || isProcessing}
            className={`p-2.5 rounded-md transition cursor-pointer flex items-center justify-center ${
              isListening
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
            }`}
            title="Toggle voice input"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>
        )}

        <button
          type="submit"
          disabled={isProcessing || !inputMessage.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-md transition shadow-xs cursor-pointer flex items-center gap-1"
        >
          {isProcessing ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
};


