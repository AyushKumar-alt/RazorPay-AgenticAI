'use client';

import React from 'react';
import { Cart } from '@/lib/cart/cart.service';
import { formatRupees } from '@/lib/money/money';

interface CartPanelProps {
  cart: Cart;
  onRemoveItem?: (productId: string) => void;
  onUpdateQuantity?: (productId: string, newQuantity: number) => void;
  onCheckout?: () => void;
}

export const CartPanel: React.FC<CartPanelProps> = ({
  cart,
  onRemoveItem,
  onUpdateQuantity,
  onCheckout,
}) => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">🛒</span>
          <h2 className="text-base font-bold text-slate-900">
            Shopping Cart ({cart.items.reduce((acc, i) => acc + i.quantity, 0)})
          </h2>
        </div>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
          Live Cart State
        </span>
      </div>

      {cart.items.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-xs">
          Your cart is currently empty. Use the Chat Assistant below to add products!
        </div>
      ) : (
        <div className="space-y-3">
          <div className="divide-y divide-slate-100">
            {cart.items.map((item) => (
              <div key={item.productId} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900 truncate">{item.productName}</div>
                  <div className="text-slate-500 font-mono text-[11px]">
                    ID: {item.productId} · {formatRupees(item.unitPricePaise)} each
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center border border-slate-200 rounded overflow-hidden">
                    {onUpdateQuantity && (
                      <button
                        onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                        className="px-2 py-0.5 bg-slate-50 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                        title="Decrease quantity"
                      >
                        -
                      </button>
                    )}
                    <span className="px-2.5 font-bold text-slate-900 text-xs font-mono">
                      {item.quantity}
                    </span>
                    {onUpdateQuantity && (
                      <button
                        onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                        className="px-2 py-0.5 bg-slate-50 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
                        title="Increase quantity"
                      >
                        +
                      </button>
                    )}
                  </div>

                  <span className="font-bold text-slate-900 font-mono w-20 text-right">
                    {formatRupees(item.subtotalPaise)}
                  </span>

                  {onRemoveItem && (
                    <button
                      onClick={() => onRemoveItem(item.productId)}
                      className="text-red-500 hover:text-red-700 text-xs font-bold transition cursor-pointer"
                      title="Remove item"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between bg-slate-50 p-3 rounded">
            <span className="font-bold text-slate-700 text-xs">Subtotal (Computed Fresh):</span>
            <span className="font-black text-blue-600 text-base font-mono">
              {formatRupees(cart.subtotalPaise)}
            </span>
          </div>

          {onCheckout && cart.items.length > 0 && (
            <button
              onClick={onCheckout}
              className="w-full mt-3 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span>💳 Proceed to Payment</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
