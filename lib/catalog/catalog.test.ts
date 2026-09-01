import fs from 'fs';
import path from 'path';
import { CatalogService } from './catalog.service';
import { SEED_PRODUCTS } from './catalog.data';

async function runCatalogExpansionTests() {
  console.log('--- RUNNING PHASE 6 CATALOG EXPANSION TEST SUITE ---');
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

  const products = CatalogService.getAllProducts();

  // Test 1: Exactly 55 products exist
  assert(products.length === 55, 'Test 1: Exactly 55 active products exist in SEED_PRODUCTS', `Count: ${products.length}`);

  // Test 2: Exactly 10 canonical categories exist
  const canonicalCategories = ['electronics', 'mobile', 'audio', 'fitness', 'home', 'fashion', 'travel', 'care', 'office', 'lifestyle'];
  const presentCategories = Array.from(new Set(products.map((p) => p.category))).sort();
  assert(
    presentCategories.length === 10 && canonicalCategories.every((c) => presentCategories.includes(c)),
    'Test 2: Exactly 10 canonical categories exist',
    `Found categories: ${presentCategories.join(',')}`
  );

  // Test 3: Every category contains at least 5 products
  const categoryCounts: Record<string, number> = {};
  products.forEach((p) => {
    categoryCounts[p.category] = (categoryCounts[p.category] || 0) + 1;
  });
  const allHaveAtLeast5 = canonicalCategories.every((c) => (categoryCounts[c] || 0) >= 5);
  assert(
    allHaveAtLeast5,
    'Test 3: Every category contains at least 5 products',
    JSON.stringify(categoryCounts)
  );

  // Test 4: Every product has a unique ID
  const uniqueIds = new Set(products.map((p) => p.id));
  assert(uniqueIds.size === 55, 'Test 4: Every product has a unique ID', `Unique count: ${uniqueIds.size}`);

  // Test 5: Every product has integer pricePaise (> 0)
  const allIntegerPrices = products.every((p) => Number.isInteger(p.pricePaise) && p.pricePaise > 0);
  assert(allIntegerPrices, 'Test 5: Every product has valid positive integer pricePaise');

  // Test 6: Every product has valid stock (integer >= 0)
  const allValidStock = products.every((p) => Number.isInteger(p.stock) && p.stock >= 0);
  assert(allValidStock, 'Test 6: Every product has valid non-negative integer stock');

  // Test 7: Every product has an imageUrl property defined
  const allHaveImageUrl = products.every((p) => p.imageUrl && p.imageUrl.trim() !== '');
  assert(allHaveImageUrl, 'Test 7: Every product has a non-empty imageUrl');

  // Test 8: Every imageUrl points to an existing local file
  const publicDir = path.join(process.cwd(), 'public');
  const missingImages = products.filter((p) => {
    if (!p.imageUrl) return true;
    const localFilePath = path.join(publicDir, p.imageUrl.replace(/^\//, ''));
    return !fs.existsSync(localFilePath);
  });
  assert(missingImages.length === 0, 'Test 8: Every imageUrl points to an existing local file in /public', `Missing: ${missingImages.map(p => p.imageUrl).join(', ')}`);

  // Test 9: Preserved bottle_001 through bottle_006 exist
  const bottleIds = ['bottle_001', 'bottle_002', 'bottle_003', 'bottle_004', 'bottle_005', 'bottle_006'];
  const bottlesExist = bottleIds.every((id) => CatalogService.getProductById(id) !== null);
  assert(bottlesExist, 'Test 9: Preserved bottle_001 through bottle_006 exist');

  // Test 10: Preserved fit_001 exists
  const fit001 = CatalogService.getProductById('fit_001');
  assert(fit001 !== null && fit001.name.includes('Yoga Mat'), 'Test 10: Preserved fit_001 exists and is Yoga Mat');

  // Test 11: bottle_004 remains ₹2,499 (249900 paise)
  const bottle004 = CatalogService.getProductById('bottle_004');
  assert(bottle004 !== null && bottle004.pricePaise === 249900, 'Test 11: bottle_004 pricePaise remains 249900 (₹2,499)');

  // Test 12: bottle_005 remains stock = 0 (out of stock)
  const bottle005 = CatalogService.getProductById('bottle_005');
  assert(bottle005 !== null && bottle005.stock === 0, 'Test 12: bottle_005 stock remains 0 (out of stock)');

  // Test 13: Search works for electronics
  const elecResults = CatalogService.searchProducts({ category: 'electronics' });
  assert(elecResults.length === 6, 'Test 13: Search for category electronics returns 6 products');

  // Test 14: Search works for audio
  const audioResults = CatalogService.searchProducts({ category: 'audio' });
  assert(audioResults.length === 5, 'Test 14: Search for category audio returns 5 products');

  // Test 15: Search works for fitness
  const fitResults = CatalogService.searchProducts({ category: 'fitness' });
  assert(fitResults.length === 6, 'Test 15: Search for category fitness returns 6 products');

  // Test 16: Search works for travel
  const travelResults = CatalogService.searchProducts({ category: 'travel' });
  assert(travelResults.length === 5, 'Test 16: Search for category travel returns 5 products');

  // Test 17: Category filtering works
  const homeResults = CatalogService.searchProducts({ category: 'home' });
  assert(homeResults.length === 6, 'Test 17: Category filtering returns 6 home & kitchen products');

  // Test 18: Price filtering works (maxPricePaise = 100000 -> under ₹1,000)
  const budgetResults = CatalogService.searchProducts({ maxPricePaise: 100000 });
  const allUnder1k = budgetResults.every((p) => p.pricePaise <= 100000);
  assert(budgetResults.length > 0 && allUnder1k, 'Test 18: Price filtering correctly excludes items above maxPricePaise');

  // Test 19: In-stock filtering excludes out-of-stock items (elec_005, audio_005, bottle_005)
  const inStockResults = CatalogService.searchProducts({ inStock: true });
  const noOutOfStock = inStockResults.every((p) => p.stock > 0);
  assert(inStockResults.length === 50 && noOutOfStock, 'Test 19: inStock filtering returns only in-stock items (50 products)');

  // Test 20: getProduct, getPrice, and checkInventory work for new category products (elec_001, audio_001, office_001)
  const prodElec = CatalogService.getProductById('elec_001');
  const priceElec = CatalogService.getCurrentPrice('elec_001');
  const stockElec = CatalogService.checkInventory('elec_001');
  assert(
    prodElec !== null && priceElec !== null && priceElec.pricePaise === 249900 && stockElec.stock === 25,
    'Test 20: getProduct, getPrice, checkInventory work for new product elec_001'
  );

  // Test 21: No duplicate product IDs exist
  const idCounts: Record<string, number> = {};
  SEED_PRODUCTS.forEach((p) => {
    idCounts[p.id] = (idCounts[p.id] || 0) + 1;
  });
  const hasDuplicates = Object.values(idCounts).some((c) => c > 1);
  assert(!hasDuplicates, 'Test 21: No duplicate product IDs exist in catalog');

  console.log(`\nTEST RESULTS SUMMARY: ${passed} Passed, ${failed} Failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runCatalogExpansionTests();
