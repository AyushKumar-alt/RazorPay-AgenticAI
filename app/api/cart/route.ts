import { NextRequest, NextResponse } from 'next/server';
import { getCart, clearCart, addToCart, removeFromCart, updateCartQuantity } from '@/lib/cart/cart.service';

export async function GET() {
  return NextResponse.json({
    success: true,
    cart: getCart(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, productId, quantity } = body;

    if (action === 'clear') {
      clearCart();
      return NextResponse.json({
        success: true,
        cart: getCart(),
      });
    }

    if (action === 'add' && productId) {
      const cart = addToCart(productId, quantity || 1);
      return NextResponse.json({ success: true, cart });
    }

    if (action === 'remove' && productId) {
      const cart = removeFromCart(productId);
      return NextResponse.json({ success: true, cart });
    }

    if (action === 'update' && productId) {
      const cart = updateCartQuantity(productId, quantity ?? 1);
      return NextResponse.json({ success: true, cart });
    }

    return NextResponse.json({ success: true, cart: getCart() });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'CART_ERROR',
          message: err.message || 'Cart operation failed.',
        },
      },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  clearCart();
  return NextResponse.json({
    success: true,
    cart: getCart(),
  });
}
