import { searchCatalog } from './search-catalog.tool';
import { getProduct } from './get-product.tool';
import { checkInventory } from './check-inventory.tool';
import { getPrice } from './get-price.tool';
import { executeCatalogTool } from './catalog-tool.registry';
import { CatalogService } from '@/lib/catalog/catalog.service';

async function runCatalogToolTests() {
  console.log('--- RUNNING PHASE 3A CATALOG TOOL TEST SUITE ---');
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

  // TEST 1: Canonical search returns bottle_001, bottle_002, bottle_003
  try {
    const res = await searchCatalog({
      merchantId: 'merchant_aquamart',
      category: 'water_bottle',
      capacity: '1L',
      material: 'stainless_steel',
      maxPricePaise: 200000,
      inStock: true,
    });

    const productIds = res.success ? res.products.map((p) => p.id).sort() : [];
    assert(
      res.success &&
        res.count === 3 &&
        productIds.join(',') === 'bottle_001,bottle_002,bottle_003',
      'Test 1: Canonical search returns exactly bottle_001, bottle_002, bottle_003',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 1', err.message);
  }

  // TEST 2: searchCatalog excludes products above maxPricePaise (bottle_004 = ₹2,499)
  try {
    const res = await searchCatalog({
      category: 'water_bottle',
      maxPricePaise: 200000,
    });
    const containsBottle004 = res.success ? res.products.some((p) => p.id === 'bottle_004') : true;
    assert(
      res.success && !containsBottle004,
      'Test 2: searchCatalog excludes bottle_004 (> ₹2,000 budget)',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 2', err.message);
  }

  // TEST 3: searchCatalog excludes out-of-stock products when inStock = true (bottle_005 = stock 0)
  try {
    const res = await searchCatalog({
      category: 'water_bottle',
      inStock: true,
    });
    const containsBottle005 = res.success ? res.products.some((p) => p.id === 'bottle_005') : true;
    assert(
      res.success && !containsBottle005,
      'Test 3: searchCatalog excludes bottle_005 when inStock = true',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 3', err.message);
  }

  // TEST 4: searchCatalog returns empty result when no products match
  try {
    const res = await searchCatalog({
      category: 'non_existent_category',
    });
    assert(
      res.success && res.count === 0 && res.products.length === 0,
      'Test 4: searchCatalog returns empty result when no products match',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 4', err.message);
  }

  // TEST 5: getProduct returns bottle_001 correctly
  try {
    const res = await getProduct({ productId: 'bottle_001' });
    assert(
      res.success && res.product.id === 'bottle_001' && res.product.pricePaise === 169900,
      'Test 5: getProduct returns bottle_001 details',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 5', err.message);
  }

  // TEST 6: getProduct returns a controlled not-found response for an invalid product ID
  try {
    const res = await getProduct({ productId: 'bottle_nonexistent' });
    assert(
      !res.success && res.error.code === 'PRODUCT_NOT_FOUND',
      'Test 6: getProduct returns controlled PRODUCT_NOT_FOUND error',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 6', err.message);
  }

  // TEST 7: checkInventory returns current stock for bottle_001
  try {
    const res = await checkInventory({ productId: 'bottle_001' });
    assert(
      res.success && res.productId === 'bottle_001' && res.stock === 23 && res.inStock === true,
      'Test 7: checkInventory returns stock for bottle_001',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 7', err.message);
  }

  // TEST 8: checkInventory correctly reports bottle_005 as stock = 0, inStock = false
  try {
    const res = await checkInventory({ productId: 'bottle_005' });
    assert(
      res.success && res.productId === 'bottle_005' && res.stock === 0 && res.inStock === false,
      'Test 8: checkInventory reports bottle_005 as stock = 0, inStock = false',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 8', err.message);
  }

  // TEST 9: getPrice returns bottle_001 pricePaise = 169900, currency = INR
  try {
    const res = await getPrice({ productId: 'bottle_001' });
    assert(
      res.success && res.productId === 'bottle_001' && res.pricePaise === 169900 && res.currency === 'INR',
      'Test 9: getPrice returns bottle_001 pricePaise = 169900, currency = INR',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 9', err.message);
  }

  // TEST 10: getPrice returns controlled not-found result for invalid product ID
  try {
    const res = await getPrice({ productId: 'bottle_invalid' });
    assert(
      !res.success && res.error.code === 'PRODUCT_NOT_FOUND',
      'Test 10: getPrice returns controlled PRODUCT_NOT_FOUND error for invalid ID',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 10', err.message);
  }

  // TEST 11: Invalid tool input is rejected by input schema
  try {
    const res = await searchCatalog({ maxPricePaise: -500 });
    assert(
      !res.success && res.error.code === 'VALIDATION_ERROR',
      'Test 11: Invalid input (negative maxPricePaise) rejected with VALIDATION_ERROR',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 11', err.message);
  }

  // TEST 12: Tool execution does not mutate catalog data (Read-Only guarantee)
  try {
    const countBefore = CatalogService.getAllProducts().length;
    await searchCatalog({ category: 'water_bottle' });
    await getProduct({ productId: 'bottle_001' });
    await checkInventory({ productId: 'bottle_001' });
    await getPrice({ productId: 'bottle_001' });
    const countAfter = CatalogService.getAllProducts().length;

    assert(
      countBefore === countAfter,
      'Test 12: Tool execution does not mutate catalog state (Read-only guarantee)',
      `before: ${countBefore}, after: ${countAfter}`
    );
  } catch (err: any) {
    assert(false, 'Test 12', err.message);
  }

  // TEST 13: Registry dispatcher handles unknown tool name with UNKNOWN_TOOL error
  try {
    const res = await executeCatalogTool('nonExistentTool' as any, {});
    assert(
      !res.success && res.error.code === 'UNKNOWN_TOOL',
      'Test 13: executeCatalogTool rejects unknown tool name with UNKNOWN_TOOL error',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 13', err.message);
  }

  // TEST 14: recommendRelatedProducts returns partner for elec_002 (Wireless Mouse) -> elec_007 (Mouse Pad)
  try {
    const res = await executeCatalogTool('recommendRelatedProducts', { productId: 'elec_002' });
    assert(
      res.success &&
        'recommendedProduct' in res &&
        res.recommendedProduct.id === 'elec_007',
      'Test 14: recommendRelatedProducts returns elec_007 (Mouse Pad) for elec_002',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 14', err.message);
  }

  // TEST 15: recommendRelatedProducts returns partner for audio_001 (Wireless Headphones) -> audio_006 (Headphone Stand)
  try {
    const res = await executeCatalogTool('recommendRelatedProducts', { productId: 'audio_001' });
    assert(
      res.success &&
        'recommendedProduct' in res &&
        res.recommendedProduct.id === 'audio_006',
      'Test 15: recommendRelatedProducts returns audio_006 (Headphone Stand) for audio_001',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 15', err.message);
  }

  // TEST 16: recommendRelatedProducts returns partner for home_002 (Lunch Box) -> home_007 (Water Bottle)
  try {
    const res = await executeCatalogTool('recommendRelatedProducts', { productId: 'home_002' });
    assert(
      res.success &&
        'recommendedProduct' in res &&
        res.recommendedProduct.id === 'home_007',
      'Test 16: recommendRelatedProducts returns home_007 (Water Bottle) for home_002',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 16', err.message);
  }

  // TEST 17: recommendRelatedProducts resolves bidirectionally for paired side mobile_006 (Phone Case) -> mobile_002 (Power Bank)
  try {
    const res = await executeCatalogTool('recommendRelatedProducts', { productId: 'mobile_006' });
    assert(
      res.success &&
        'recommendedProduct' in res &&
        res.recommendedProduct.id === 'mobile_002',
      'Test 17: recommendRelatedProducts returns mobile_002 bidirectionally for paired side mobile_006',
      JSON.stringify(res)
    );
  } catch (err: any) {
    assert(false, 'Test 17', err.message);
  }

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runCatalogToolTests();

