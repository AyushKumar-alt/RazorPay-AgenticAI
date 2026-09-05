import { CartService, addToCart, removeFromCart, updateCartQuantity, getCart } from './cart.service';
import { CatalogService } from '@/lib/catalog/catalog.service';
import { PurchaseService } from '@/lib/purchase/purchase.service';
import { RazorpayService } from '@/lib/payment/razorpay.service';
import { MockRazorpayProvider } from '@/lib/payment/razorpay.provider';

async function runCartVerification() {
  console.log('--- RUNNING CART AUTHORITATIVE STATE VERIFICATION ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${detail || 'Assertion failed'}`);
      failed++;
    }
  }

  // Setup test environment
  CartService.clearCart();
  PurchaseService.clearProposals();
  const mockProvider = new MockRazorpayProvider();
  RazorpayService.setProvider(mockProvider);

  // Products from catalog.data.ts
  const mouseId = 'elec_002'; // SwiftLink Wireless Ergonomic Mouse (₹699 = 69,900 paise)
  const padId = 'mobile_004';   // DuraCable Braided Cable / Accessory (₹399 = 39,900 paise)

  const mouseProduct = CatalogService.getProductById(mouseId);
  const padProduct = CatalogService.getProductById(padId);

  assert(!!mouseProduct && !!padProduct, 'Setup: Catalog products loaded from catalog.data.ts');

  if (!mouseProduct || !padProduct) {
    process.exit(1);
  }

  const mousePrice = mouseProduct.pricePaise; // 69900
  const padPrice = padProduct.pricePaise;     // 39900

  // 1. addToCart(mouseId, 1) -> getCart() shows correct item + subtotal
  try {
    addToCart(mouseId, 1);
    const cart1 = getCart();

    assert(cart1.items.length === 1, 'Verification 1a: Cart contains 1 item');
    assert(cart1.items[0].productId === mouseId, 'Verification 1b: Product ID matches mouseId');
    assert(cart1.items[0].quantity === 1, 'Verification 1c: Quantity is 1');
    assert(
      cart1.items[0].unitPricePaise === mousePrice,
      `Verification 1d: Price read strictly from catalog.data.ts (${mousePrice}p)`
    );
    assert(cart1.subtotalPaise === mousePrice, `Verification 1e: Fresh subtotal equals mouse price (${mousePrice}p)`);
  } catch (err: any) {
    assert(false, 'Verification 1: addToCart mouse failure', err.message);
  }

  // 2. addToCart(padId, 1) -> subtotal increases by pad's exact price
  try {
    addToCart(padId, 1);
    const cart2 = getCart();

    const expectedSubtotal = mousePrice + padPrice; // 69900 + 39900 = 109800
    assert(cart2.items.length === 2, 'Verification 2a: Cart contains 2 items');
    assert(
      cart2.subtotalPaise === expectedSubtotal,
      `Verification 2b: Subtotal increased by pad's exact catalog price (${padPrice}p -> total ${expectedSubtotal}p)`
    );
  } catch (err: any) {
    assert(false, 'Verification 2: addToCart pad failure', err.message);
  }

  // 3. removeFromCart(padId) -> subtotal reverts to mouse-only total
  try {
    removeFromCart(padId);
    const cart3 = getCart();

    assert(cart3.items.length === 1, 'Verification 3a: Cart items reduced back to 1');
    assert(cart3.items[0].productId === mouseId, 'Verification 3b: Remaining item is mouse');
    assert(
      cart3.subtotalPaise === mousePrice,
      `Verification 3c: Subtotal reverted to mouse-only total (${mousePrice}p)`
    );
  } catch (err: any) {
    assert(false, 'Verification 3: removeFromCart pad failure', err.message);
  }

  // 4. updateCartQuantity(mouseId, 3) -> subtotal reflects qty 3
  try {
    updateCartQuantity(mouseId, 3);
    const cart4 = getCart();

    const expectedQty3Total = mousePrice * 3; // 69900 * 3 = 209700
    assert(cart4.items[0].quantity === 3, 'Verification 4a: Mouse quantity updated to 3');
    assert(
      cart4.subtotalPaise === expectedQty3Total,
      `Verification 4b: Subtotal correctly reflects qty 3 (${expectedQty3Total}p)`
    );

    // Also test quantity <= 0 removes item
    updateCartQuantity(mouseId, 0);
    const cartEmpty = getCart();
    assert(cartEmpty.items.length === 0 && cartEmpty.subtotalPaise === 0, 'Verification 4c: updateCartQuantity(id, 0) removes item');

    // Restore qty 3 for checkout integration test
    updateCartQuantity(mouseId, 3);
  } catch (err: any) {
    assert(false, 'Verification 4: updateCartQuantity failure', err.message);
  }

  // 5. Existing checkout page integration: Reads cart state and produces identical total in PurchaseService & RazorpayService
  try {
    const checkoutRes = await CartService.checkoutCart('merchant_aquamart');
    assert(!!checkoutRes.proposalId, 'Verification 5a: Existing checkout pipeline creates proposal from cart');

    const p = checkoutRes;
    p.status = 'APPROVED';
    PurchaseService.saveProposal(p);

      assert(p.productId === mouseId, 'Verification 5b: Proposal reads exact product ID from cart');
      assert(p.quantity === 3, 'Verification 5c: Proposal reads exact quantity (3) from cart');
      assert(
        p.unitPricePaise === mousePrice,
        'Verification 5d: Proposal unit price matches catalog.data.ts price'
      );

      // Verify Razorpay Order Creation reads same proposal total
      const orderRes = await RazorpayService.createPaymentOrder(p.proposalId);
      assert(orderRes.success === true, 'Verification 5e: Razorpay Order created from approved proposal');
      assert(
        orderRes.transaction?.amountPaise === p.totalPaise,
        'Verification 5f: Razorpay Order total matches cart proposal total — proving ONE cart mechanism'
      );
  } catch (err: any) {
    assert(false, 'Verification 5: Checkout integration failure', err.message);
  }

  console.log(`\n--- CART VERIFICATION SUMMARY: ${passed} Passed, ${failed} Failed ---`);
  if (failed > 0) {
    process.exit(1);
  }
}

runCartVerification().catch((err) => {
  console.error('Unhandled error in cart verification script:', err);
  process.exit(1);
});
