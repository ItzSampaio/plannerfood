import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/lib/catalogue';
import { observationIsStale, parseObservationImport, suggestObservationMatches, type RawObservation } from '../../src/lib/data/observations';
import { observationFromOpenFoodFacts, observationFromOpenPrices, observationFromScraplingCollector } from '../../src/lib/data/source-adapters';
import { approveObservation, type ObservationReview } from '../../src/lib/data/observation-approval';

const observation = (overrides: Partial<RawObservation> = {}): RawObservation => ({
  id: 'scrapling-1', source: 'scrapling', retailer: 'continente', sourceProductId: '1', ean: null, name: 'Arroz agulha', brand: 'Marca',
  package: { size: null, unit: null, text: null, fixed: null }, price: { amount: 1.2, currency: 'EUR', unitAmount: null, unit: null, promotionalAmount: null, originalAmount: null },
  sourceUrl: 'https://example.org/product', observedAt: '2026-11-17T12:00:00.000Z', raw: { source: 'fixture' }, retrievalError: null,
  ingredients: null, allergens: 'unknown', nutrition: null, dietaryCompatibility: null, reviewStatus: 'pending', ...overrides,
});
const review = (overrides: Partial<ObservationReview> = {}): ObservationReview => ({ action: 'new_product', ingredientId: 'arroz', packageSize: 1000, packageUnit: 'g', confirmIdentity: true, confirmPackage: true, confirmAllergens: true, confirmDiet: true, fields: ['name', 'brand', 'price', 'source'], approvedAt: '2026-11-17T13:00:00.000Z', ...overrides });

describe('source-neutral product observations', () => {
  it('keeps provenance and missing fields instead of inventing values', () => {
    const parsed = parseObservationImport({ observations: [observation()] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.observations[0]).toMatchObject({ source: 'scrapling', price: { amount: 1.2 }, package: { size: null }, allergens: 'unknown', reviewStatus: 'pending' });
  });

  it('suggests exact EAN matches but does not approve them', () => {
    const product = catalogue.products[0];
    expect(product).toBeDefined();
    const parsed = parseObservationImport({ observations: [observation({ ean: product?.barcode ?? '5600000000000' })] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok && product) expect(suggestObservationMatches(parsed.observations[0], catalogue).some((match) => match.productId === product.id && match.kind === 'exact_ean')).toBe(Boolean(product.barcode));
  });

  it('keeps name-only matches as review candidates', () => {
    const parsed = parseObservationImport({ observations: [observation({ ean: null, name: catalogue.products[0]?.name ?? 'Arroz' })] });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(suggestObservationMatches(parsed.observations[0], catalogue).every((match) => match.kind === 'name_candidate')).toBe(true);
  });

  it('classifies old observations as stale', () => {
    expect(observationIsStale(observation({ observedAt: '2026-11-16T23:59:00.000Z' }), '2026-11-17')).toBe(true);
    expect(observationIsStale(observation(), '2026-11-17')).toBe(false);
  });

  it('rejects malformed observation records', () => {
    const parsed = parseObservationImport([{ id: 'x', source: 'unknown', observedAt: 'today' }]);
    expect(parsed.ok).toBe(false);
  });

  it('keeps Open Food Facts safety data separate from price data', () => {
    const result = observationFromOpenFoodFacts({ code: '5601234567890', product: { product_name: 'Produto', brands: 'Marca', ingredients_text: 'água', allergens_tags: ['en:milk'], nutriments: { energy_100g: 1 } } }, '2026-11-17T12:00:00.000Z');
    expect(result.source).toBe('open_food_facts');
    expect(result.ean).toBe('5601234567890');
    expect(result.price.amount).toBeNull();
    expect(result.allergens).toBe('unknown');
  });

  it('preserves Open Prices provenance and does not call it verified', () => {
    const result = observationFromOpenPrices({ id: 4, product_code: '5601234567890', price: 2.5, currency: 'EUR', price_without_discount: 3, price_is_discounted: true, proof: { url: 'https://prices.openfoodfacts.org/proofs/4' } }, '2026-11-17T12:00:00.000Z');
    expect(result.source).toBe('open_prices');
    expect(result.price.promotionalAmount).toBe(2.5);
    expect(result.price.originalAmount).toBe(3);
    expect(result.reviewStatus).toBe('pending');
  });

  it('requires explicit confirmations and creates an observed, not verified, product', () => {
    const result = approveObservation(catalogue, observation({ name: 'Arroz novo' }), review());
    expect(result.ok).toBe(true);
    if (result.ok) {
      const product = result.catalogue.products.find((item) => item.id === result.audit.productId);
      expect(product?.priceState).toBe('observado');
      expect(product?.priceObservation?.provider).toBe('scrapling');
      expect(result.audit.changedFields).toContain('priceState');
    }
  });

  it('rejects approval when a safety confirmation is missing', () => {
    const result = approveObservation(catalogue, observation(), review({ confirmAllergens: false }));
    expect(result.ok).toBe(false);
  });

  it('does not weaken an existing product allergen declaration', () => {
    const existing = catalogue.products[0];
    expect(existing).toBeDefined();
    if (!existing) return;
    const result = approveObservation(catalogue, observation({ name: existing.name, ean: existing.barcode, allergens: 'unknown' }), review({ action: 'existing_product', targetProductId: existing.id, fields: ['name', 'price'] }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.catalogue.products.find((item) => item.id === existing.id)?.allergens).toEqual(existing.allergens);
  });

  it('normalizes standalone Scrapling collector output without inventing safety fields', () => {
    const result = observationFromScraplingCollector({ ok: true, retailer: 'continente', productId: '2597619', productName: 'Banana Continente', brand: 'Continente', displayedPrice: '1.19', currency: 'EUR', pricePerUnit: { amount: 0.24, unit: 'un' }, url: 'https://www.continente.pt/produto/banana-continente-2597619.html', observedAt: '2026-11-17T16:37:18.000Z', raw: { jsonLd: { price: '1.19' } } });
    expect(result.source).toBe('scrapling');
    expect(result.ean).toBeNull();
    expect(result.price.amount).toBe(1.19);
    expect(result.price.unitAmount).toBe(0.24);
    expect(result.allergens).toBe('unknown');
    expect(result.reviewStatus).toBe('pending');
  });
});
