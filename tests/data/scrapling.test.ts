import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/lib/catalogue';
import { validateCatalogue, validateProducts } from '../../src/lib/data/validators';
import { effectivePackPriceCents, effectiveProductPriceState, selectProduct } from '../../src/lib/calc/select-product';
import { computeBasket } from '../../src/lib/calc/basket';
import { getBudgetStatus } from '../../src/lib/calc/budget-status';
import { POST } from '../../src/app/api/scrapling/refresh/route';
import { TESTED_HISTORICAL_OBSERVATIONS } from '../../src/lib/pricing/scrapling';
import type { Basket, BasketLine, Product, QuantityWarning, UserProfile } from '../../src/lib/types';
import { lisbonDate } from '../../src/lib/pricing/cesta-mcp';

const baseProduct = catalogue.products[0]!;

describe('Phase 7 — Scrapling integration, safety gating and price observations', () => {
  it('validates products with scrapling provider and catalogueSource', () => {
    const today = lisbonDate(new Date().toISOString());
    const validScraplingProduct: Product = {
      ...baseProduct,
      id: 'scrapling-continente-2027209',
      name: 'Arroz Agulha Continente',
      brand: 'Continente',
      supermarketId: 'continente',
      ingredientId: 'arroz',
      packSize: 1000,
      unit: 'g',
      price: 1.15,
      priceState: 'observado',
      priceUpdatedAt: today,
      priceObservation: {
        provider: 'scrapling',
        sourceProductId: '2027209',
        checkedAt: new Date().toISOString(),
        checkedDate: today,
        currency: 'EUR',
        availability: 'available',
        unitPrice: { amount: 1.15, unit: 'kg' },
      },
      allergens: [],
      dietCompatibility: {
        vegetariana: 'compativel',
        vegana: 'compativel',
        sem_gluten: 'compativel',
        sem_lactose: 'compativel',
      },
      catalogueSource: 'scrapling',
      productUrl: 'https://www.continente.pt/produto/arroz-agulha-continente-2027209.html',
    };

    const res = validateProducts([validScraplingProduct], catalogue.ingredients);
    expect(res.ok).toBe(true);
  });

  it('rejects scrapling products with invalid observation date or missing price', () => {
    const badProduct: Product = {
      ...baseProduct,
      id: 'scrapling-bad-1',
      price: null,
      priceState: 'observado',
      priceUpdatedAt: '2026-11-17',
      priceObservation: {
        provider: 'scrapling',
        sourceProductId: 'bad',
        checkedAt: '2026-11-17T12:00:00Z',
        checkedDate: '2026-11-17',
        currency: 'EUR',
        availability: 'available',
      },
      catalogueSource: 'scrapling',
    };

    const res = validateProducts([badProduct], catalogue.ingredients);
    expect(res.ok).toBe(false);
  });

  it('API route returns tested historical observations when requested', async () => {
    const req = new Request('http://localhost:3000/api/scrapling/refresh?fallback=true', {
      method: 'POST',
    });
    const response = await POST(req);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.products).toHaveLength(3);

    const arroz = data.products.find((p: { sourceProductId: string }) => p.sourceProductId === '2027209');
    expect(arroz?.price).toBe(1.15);
    expect(arroz?.supermarketId).toBe('continente');

    const banana = data.products.find((p: { sourceProductId: string }) => p.sourceProductId === '2003051');
    expect(banana?.isWeighted).toBe(true);
    expect(banana?.price).toBe(1.19);
    expect(banana?.unitPrice).toEqual({ amount: 1.19, unit: 'kg' });

    const pizza = data.products.find((p: { sourceProductId: string }) => p.sourceProductId === 'dr-oetker-pizza-mozzarella-355g');
    expect(pizza?.price).toBe(3.79);
    expect(pizza?.supermarketId).toBe('pingo_doce');
  });

  it('API route handles retailer failure or simulated error cleanly', async () => {
    const req = new Request('http://localhost:3000/api/scrapling/refresh?simulate_error=true', {
      method: 'POST',
    });
    const response = await POST(req);
    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('SIMULATED_RETAILER_FAILURE');
  });

  it('API route handles missing python execution gracefully', async () => {
    const req = new Request('http://localhost:3000/api/scrapling/refresh', {
      method: 'POST',
    });
    const response = await POST(req);
    const data = await response.json();
    if (!data.ok) {
      expect(data.code).toBeDefined();
      expect(data.error).toBeDefined();
      expect(data.fallbackAvailable).toBe(true);
      expect(Array.isArray(data.historicalObservations)).toBe(true);
    }
  });

  it('excludes stale scrapling observations from current product selection', () => {
    const checkedDate = '2026-11-16';
    const today = '2026-11-17';
    const staleProduct: Product = {
      ...baseProduct,
      id: 'scrapling-stale',
      price: 1.15,
      priceState: 'observado',
      priceUpdatedAt: checkedDate,
      priceObservation: {
        provider: 'scrapling',
        sourceProductId: '2027209',
        checkedAt: `${checkedDate}T10:00:00.000Z`,
        checkedDate: checkedDate,
        currency: 'EUR',
        availability: 'available',
      },
      catalogueSource: 'scrapling',
    };

    expect(effectiveProductPriceState(staleProduct, today)).toBe('desconhecido');
    expect(effectivePackPriceCents(staleProduct, today)).toBeNull();

    // But if today matches checkedDate, it is active
    expect(effectiveProductPriceState(staleProduct, checkedDate)).toBe('observado');
    expect(effectivePackPriceCents(staleProduct, checkedDate)).toBe(115);
  });

  it('blocks safety checks when imported product has unknown allergens', () => {
    const profile: UserProfile = {
      supermarketId: 'continente',
      people: 2,
      mealTypes: ['almoco'],
      dietaryRule: 'nenhuma',
      allergens: ['gluten'],
      exclusionText: [],
      ownedIngredientIds: [],
      priority: 'mais_barato',
      weeklyBudget: 50,
    };

    const unsafeProduct: Product = {
      ...baseProduct,
      id: 'unsafe-scrapling',
      ingredientId: 'arroz',
      allergens: 'unknown',
      priceState: 'observado',
      price: 1.15,
    };

    const testCatalogue = {
      ...catalogue,
      products: [unsafeProduct],
    };

    const selection = selectProduct('arroz', 500, profile, testCatalogue, '2026-11-17');
    expect(selection.status).toBe('unavailable');
  });

  it('treats weighted banana with packSize and unit price faithfully in basket calculation', () => {
    const today = '2026-11-17';
    const bananaProduct: Product = {
      ...baseProduct,
      id: 'scrapling-banana-continente',
      name: 'Banana Importada Continente',
      supermarketId: 'continente',
      ingredientId: 'banana',
      packSize: 1000,
      unit: 'g',
      price: 1.19,
      priceState: 'observado',
      priceUpdatedAt: today,
      priceObservation: {
        provider: 'scrapling',
        sourceProductId: '2003051',
        checkedAt: `${today}T09:00:00.000Z`,
        checkedDate: today,
        currency: 'EUR',
        availability: 'available',
        unitPrice: { amount: 1.19, unit: 'kg' },
      },
      allergens: [],
      dietCompatibility: {
        vegetariana: 'compativel',
        vegana: 'compativel',
        sem_gluten: 'compativel',
        sem_lactose: 'compativel',
      },
      catalogueSource: 'scrapling',
    };

    const profile: UserProfile = {
      supermarketId: 'continente',
      people: 2,
      mealTypes: ['lanche'],
      dietaryRule: 'nenhuma',
      allergens: [],
      exclusionText: [],
      ownedIngredientIds: [],
      priority: 'mais_barato',
      weeklyBudget: 50,
    };

    const testCatalogue = {
      ...catalogue,
      products: [...catalogue.products, bananaProduct],
    };

    // Need 600g of banana: requires 1 pack of 1000g at 1.19 EUR
    const selection = selectProduct('banana', 600, profile, testCatalogue, today, bananaProduct.id);
    expect(selection.status).toBe('selected');
    if (selection.status === 'selected') {
      expect(selection.packs).toBe(1);
      expect(selection.checkoutCents).toBe(119);
      expect(selection.consumptionCents).toBe(71); // 600/1000 * 119 = 71.4 -> 71 cents
    }
  });

  it('budget status remains incompleto when any active basket line has an unknown or stale price', () => {
    const unknownLine: BasketLine = {
      ingredientId: 'arroz',
      ingredientName: 'Arroz',
      quantity: 1000,
      quantityUncertain: false,
      warnings: [],
      owned: false,
      selection: {
        status: 'selected' as const,
        product: baseProduct,
        packs: 1,
        priceState: 'desconhecido' as const,
        perPackPriceCents: null,
        checkoutCents: null,
        consumptionCents: null,
      },
      checkoutCents: null,
      consumptionCents: null,
    };
    const basket: Basket = {
      lines: [unknownLine],
      subtotalKnownCents: 0,
      estimatedTotalCents: 0,
      unknownLines: [unknownLine],
      rangeCents: null,
      consumptionTotalCents: 0,
      observedTotalCents: 0,
      consumptionIncomplete: true,
      hasEstimate: false,
      hasObservation: false,
      hasUnknown: true,
      hasUnavailable: false,
      hasUncertainQuantity: false,
    };

    const status = getBudgetStatus(basket, 5000);
    expect(status).toBe('incompleto');
  });
});
