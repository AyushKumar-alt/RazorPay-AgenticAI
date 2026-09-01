import React from 'react';
import { BuyerRecommendation } from '@/lib/agent/buyer/buyer.schema';
import { Product } from '@/types/catalog';

interface ProductRecommendationsProps {
  recommendations: BuyerRecommendation | null;
  catalogProducts?: Product[];
  onSelectProduct?: (productId: string) => void;
  selectedProductId?: string | null;
}

export const ProductRecommendations: React.FC<ProductRecommendationsProps> = ({
  recommendations,
  catalogProducts = [],
  onSelectProduct,
  selectedProductId,
}) => {
  if (!recommendations || recommendations.recommendations.length === 0) {
    return null;
  }

  const getProductDetails = (productId: string): Product | undefined => {
    return catalogProducts.find((p) => p.id === productId);
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Agent Recommendations ({recommendations.recommendations.length})
        </h4>
        <span className="text-xs text-slate-400">
          Select by clicking or saying &quot;the second one&quot;
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {recommendations.recommendations.map((rec, index) => {
          const product = getProductDetails(rec.productId);
          const isSelected = selectedProductId === rec.productId;
          const displayPrice = product
            ? (product.pricePaise / 100).toLocaleString('en-IN')
            : null;

          return (
            <div
              key={rec.productId}
              className={`relative flex flex-col justify-between p-3.5 rounded-xl border transition-all ${
                isSelected
                  ? 'border-blue-600 bg-blue-50/50 shadow-md ring-1 ring-blue-600'
                  : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
              }`}
            >
              {/* Candidate Index Badge (#1, #2, #3...) */}
              <div className="absolute top-2.5 right-2.5 flex items-center justify-center w-6 h-6 rounded-full bg-slate-900 text-white font-bold text-xs shadow">
                #{index + 1}
              </div>

              <div>
                <h5 className="font-semibold text-slate-900 text-sm pr-8">
                  {product ? product.name : rec.productId}
                </h5>

                {displayPrice && (
                  <div className="mt-1 font-bold text-slate-900 text-base">
                    ₹{displayPrice}
                  </div>
                )}

                <p className="mt-1.5 text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {rec.reason}
                </p>

                {product && product.attributes && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(product.attributes)
                      .slice(0, 3)
                      .map(([k, v]) => (
                        <span
                          key={k}
                          className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded border border-slate-200"
                        >
                          {k}: {String(v)}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] text-slate-500 font-medium">
                  {product && product.stock > 0
                    ? `In Stock (${product.stock})`
                    : 'Out of Stock'}
                </span>

                <button
                  type="button"
                  onClick={() => onSelectProduct && onSelectProduct(rec.productId)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                  aria-label={`Select option #${index + 1}: ${product?.name || rec.productId}`}
                >
                  {isSelected ? 'Selected ✓' : `Select #${index + 1}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
