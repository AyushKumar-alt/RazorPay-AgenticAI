export interface Merchant {
  id: string;
  name: string;
  description: string;
  currency: string;
  active: boolean;
}

export interface ProductAttributes {
  capacity?: string;
  material?: string;
  insulation?: boolean;
  color?: string;
  weightGrams?: number;
  dimensions?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface DeliveryInfo {
  estimatedDays: number;
  shippingFeePaise: number;
  freeShippingThresholdPaise?: number;
  expressAvailable: boolean;
}

export interface Product {
  id: string;
  merchantId: string;
  name: string;
  category: string;
  description: string;
  pricePaise: number; // Price in integer paise (₹1 = 100 paise)
  currency: string;
  attributes: ProductAttributes;
  stock: number;
  deliveryInfo: DeliveryInfo;
  returnPolicy: string;
  active: boolean;
  imageUrl?: string;
}

export interface ProductFilter {
  category?: string;
  maxPricePaise?: number;
  minPricePaise?: number;
  attributes?: Record<string, string>;
  inStock?: boolean;
  merchantId?: string;
  search?: string; // Substring matching on name, description, category
}
