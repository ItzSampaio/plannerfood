import type { AllergenInfo } from '../types';
import type { RawObservation } from './observations';

export function observationFromScraplingCollector(payload: unknown): RawObservation {
  const value = record(payload);
  const retailer = value.retailer === 'continente' || value.retailer === 'pingo_doce' ? value.retailer : null;
  const price = number(value.displayedPrice);
  const unitPrice = record(value.pricePerUnit);
  return {
    id: `scrapling-${text(value.productId) ?? text(value.url) ?? String(value.observedAt ?? 'unknown')}`,
    source: 'scrapling', retailer, sourceProductId: text(value.productId), ean: text(value.ean), name: text(value.productName), brand: text(value.brand),
    package: { size: number(value.packageSize), unit: baseUnit(value.packageUnit), text: text(value.packageText), fixed: typeof value.weightedProduct === 'boolean' ? !value.weightedProduct : null },
    price: { amount: price, currency: text(value.currency), unitAmount: number(unitPrice.amount), unit: priceUnit(unitPrice.unit), promotionalAmount: number(value.promotionalPrice), originalAmount: number(value.originalPrice) },
    sourceUrl: text(value.url), observedAt: text(value.observedAt) ?? new Date(0).toISOString(), raw: value.raw ?? payload, retrievalError: text(value.error) ?? null,
    ingredients: text(value.ingredients), allergens: 'unknown', nutrition: value.nutrition ?? null, dietaryCompatibility: null, reviewStatus: 'pending',
  };
}

/** Pure adapters for user-supplied JSON. They deliberately do not perform HTTP requests. */
export function openFoodFactsProductUrl(ean: string): string { return `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(ean)}.json`; }

export function observationFromOpenFoodFacts(payload: unknown, observedAt: string): RawObservation {
  const root = record(payload);
  const nested = record(root.product);
  const product = Object.keys(nested).length ? nested : root;
  const ean = text(root.code) ?? text(product.code) ?? text(product._id);
  return {
    id: `open-food-facts-${ean ?? observedAt}`,
    source: 'open_food_facts', retailer: null, sourceProductId: ean, ean,
    name: text(product.product_name), brand: text(product.brands),
    package: { size: null, unit: null, text: text(product.quantity), fixed: null },
    price: { amount: null, currency: null, unitAmount: null, unit: null, promotionalAmount: null, originalAmount: null },
    sourceUrl: ean ? openFoodFactsProductUrl(ean) : 'https://world.openfoodfacts.org/', observedAt,
    raw: payload, retrievalError: null, ingredients: text(product.ingredients_text), allergens: allergens(product.allergens_tags), nutrition: product.nutriments ?? null,
    dietaryCompatibility: null, reviewStatus: 'pending',
  };
}

export function observationFromOpenPrices(payload: unknown, observedAt: string): RawObservation {
  const value = record(payload);
  const price = number(value.price);
  return {
    id: `open-prices-${text(value.id) ?? observedAt}`, source: 'open_prices', retailer: null,
    sourceProductId: text(value.product_code) ?? text(value.id), ean: text(value.product_code), name: null, brand: null,
    package: { size: null, unit: null, text: null, fixed: null },
    price: { amount: price, currency: text(value.currency), unitAmount: number(value.price_per), unit: priceUnit(value.price_per) ? priceUnit(value.price_per) : null, promotionalAmount: value.price_is_discounted === true ? price : null, originalAmount: number(value.price_without_discount) },
    sourceUrl: text(record(value.proof).url) ?? 'https://prices.openfoodfacts.org/', observedAt, raw: payload, retrievalError: null,
    ingredients: null, allergens: 'unknown', nutrition: null, dietaryCompatibility: null, reviewStatus: 'pending',
  };
}

function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function number(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value.replace(',', '.')))) return Number(value.replace(',', '.'));
  return null;
}
function priceUnit(value: unknown): 'kg' | 'l' | 'un' | null { return value === 'kg' || value === 'l' || value === 'un' ? value : null; }
function baseUnit(value: unknown): 'g' | 'ml' | 'un' | null { return value === 'g' || value === 'ml' || value === 'un' ? value : null; }
function allergens(value: unknown): AllergenInfo { return Array.isArray(value) && value.length === 0 ? [] : 'unknown'; }
