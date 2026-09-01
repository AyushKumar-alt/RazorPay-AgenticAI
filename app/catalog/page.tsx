'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { DEMO_MERCHANT, SEED_PRODUCTS } from '@/lib/catalog/catalog.data';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { formatRupees } from '@/lib/money/money';
import { ProductFilter } from '@/types/catalog';

export default function CatalogDevPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [maxPriceRupees, setMaxPriceRupees] = useState<number>(3000);
  const [onlyInStock, setOnlyInStock] = useState<boolean>(false);
  const [selectedCapacity, setSelectedCapacity] = useState<string>('all');
  const [selectedMaterial, setSelectedMaterial] = useState<string>('all');

  const categories = useMemo(() => {
    const set = new Set(SEED_PRODUCTS.map((p) => p.category));
    return ['all', ...Array.from(set)];
  }, []);

  const filteredProducts = useMemo(() => {
    const filters: ProductFilter = {
      search: search || undefined,
      category: selectedCategory !== 'all' ? selectedCategory : undefined,
      maxPricePaise: maxPriceRupees ? maxPriceRupees * 100 : undefined,
      inStock: onlyInStock ? true : undefined,
      attributes: {},
    };

    if (selectedCapacity !== 'all') {
      filters.attributes!.capacity = selectedCapacity;
    }
    if (selectedMaterial !== 'all') {
      filters.attributes!.material = selectedMaterial;
    }

    if (Object.keys(filters.attributes!).length === 0) {
      delete filters.attributes;
    }

    return CatalogService.searchProducts(filters);
  }, [search, selectedCategory, maxPriceRupees, onlyInStock, selectedCapacity, selectedMaterial]);

  const applyCanonicalPreset = () => {
    setSearch('');
    setSelectedCategory('water_bottle');
    setMaxPriceRupees(2000);
    setOnlyInStock(true);
    setSelectedCapacity('1L');
    setSelectedMaterial('stainless_steel');
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedCategory('all');
    setMaxPriceRupees(3000);
    setOnlyInStock(false);
    setSelectedCapacity('all');
    setSelectedMaterial('all');
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-1">
              <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-base font-bold">Agent</span>
              <span className="text-blue-600">AI</span>
            </Link>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-semibold text-slate-600">Merchant Developer Catalog (AquaMart)</span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/api/catalog/products"
              target="_blank"
              className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition"
            >
              API Endpoint
            </Link>
            <Link
              href="/"
              className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
            >
              ← Back to Shopping
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Merchant Banner */}
        <div className="bg-white rounded-lg border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                Authoritative Catalog
              </span>
              <span className="text-xs font-mono text-slate-400">ID: {DEMO_MERCHANT.id}</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{DEMO_MERCHANT.name}</h1>
            <p className="text-slate-500 text-xs mt-0.5">{DEMO_MERCHANT.description}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={applyCanonicalPreset}
              className="px-4 py-2 text-xs font-bold rounded bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
            >
              Test Canonical Filter (1L Steel ≤ ₹2,000)
            </button>
            <button
              onClick={resetFilters}
              className="px-3 py-2 text-xs font-medium rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Search</label>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name..."
                className="w-full px-3 py-2 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Category</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 capitalize"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Max Price: ₹{maxPriceRupees}</label>
              <input
                type="range"
                min="500"
                max="5000"
                step="100"
                value={maxPriceRupees}
                onChange={(e) => setMaxPriceRupees(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer mt-2"
              />
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Capacity</label>
              <select
                value={selectedCapacity}
                onChange={(e) => setSelectedCapacity(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600"
              >
                <option value="all">Any Capacity</option>
                <option value="750ml">750ml</option>
                <option value="1L">1L</option>
                <option value="1.2L">1.2L</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-600 font-medium mb-1">Material</label>
              <select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                className="w-full px-3 py-2 rounded bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-blue-600 capitalize"
              >
                <option value="all">Any Material</option>
                <option value="stainless_steel">Stainless Steel</option>
                <option value="plastic">Plastic</option>
                <option value="TPE">TPE</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 text-xs">
            <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
              <input
                type="checkbox"
                checked={onlyInStock}
                onChange={(e) => setOnlyInStock(e.target.checked)}
                className="accent-blue-600 rounded"
              />
              Show In-Stock Items Only
            </label>
          </div>
        </div>

        {/* Product Results */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Found {filteredProducts.length} of {SEED_PRODUCTS.length} products</span>
            <span className="font-mono">maxPricePaise = {maxPriceRupees * 100} paise</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-md transition p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="w-full h-32 bg-slate-100 rounded mb-3 flex items-center justify-center text-slate-400 text-xs font-bold uppercase">
                    {product.category.replace('_', ' ')}
                  </div>

                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-slate-400">ID: {product.id}</span>
                    {product.stock > 0 ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        In Stock ({product.stock})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
                        Out of Stock
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mb-1 leading-snug">{product.name}</h3>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">{product.description}</p>

                  <div className="flex flex-wrap gap-1.5 text-[11px] mb-4">
                    {Object.entries(product.attributes).map(([k, v]) => (
                      <span key={k} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-baseline justify-between">
                  <div>
                    <span className="text-2xl font-black text-slate-900 block">{formatRupees(product.pricePaise)}</span>
                    <span className="text-[10px] font-mono text-slate-400">({product.pricePaise} paise)</span>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">+₹{product.deliveryInfo.shippingFeePaise / 100} shipping</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
