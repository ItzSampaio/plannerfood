import { describe, expect, it } from 'vitest';
import { computeBasket } from '../../src/lib/calc/basket';
import { consolidateNeeds } from '../../src/lib/calc/consolidate';
import { getBudgetStatus } from '../../src/lib/calc/budget-status';
import { selectProduct } from '../../src/lib/calc/select-product';
import { toCents } from '../../src/lib/money';
import { fakeCalcCatalogue, fakeCalcPlan, fakeDietUnsafeProduct, fakeEstimate } from '../fixtures/FAKE_calc';
import { createSeededRandom } from '../fixtures/seededRandom';

describe('calculation engine', () => {
  it('rounds a 300 g need up to one full 1 kg package', () => {
    const catalogue = fakeCalcCatalogue();
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.lines[0]?.selection).toMatchObject({ status: 'selected', packs: 1, checkoutCents: 200 });
    expect(basket.consumptionTotalCents).toBe(60);
  });

  it('rounds a partial final package up for requirements spanning packages', () => {
    const catalogue = fakeCalcCatalogue();
    const plan = fakeCalcPlan(catalogue);
    plan.profile.people = 8;
    const basket = computeBasket(plan, catalogue, '2026-11-16');
    expect(basket.lines[0]?.selection).toMatchObject({ status: 'selected', packs: 2, checkoutCents: 400 });
    expect(basket.lines[0]?.quantity).toBe(1200);
  });

  it('calculates variable-weight expected cost without claiming exact checkout weight', () => {
    const catalogue = fakeCalcCatalogue();
    const base = catalogue.products[0]!;
    catalogue.products = [{ ...base, id: 'banana-weight', name: 'Banana', sellingModel: 'variable_weight', unit: 'g', packSize: 1, price: 1.99, priceState: 'manual', priceUpdatedAt: '2026-11-16', unitPrice: { amount: 1.99, unit: 'kg' }, minimumQuantity: 600, minimumQuantityUnit: 'g' }];
    const selected = selectProduct('rice', 300, fakeCalcPlan(catalogue).profile, catalogue, '2026-11-16');
    expect(selected).toMatchObject({ status: 'selected', checkoutCents: null, expectedCheckoutCents: 119, checkoutQuantity: 600, checkoutQuantityKnown: false });
  });

  it('uses actual variable checkout quantity when explicitly recorded', () => {
    const catalogue = fakeCalcCatalogue();
    const base = catalogue.products[0]!;
    catalogue.products = [{ ...base, id: 'apples-unit', sellingModel: 'per_unit', unit: 'un', packSize: 1, price: 0.5, priceState: 'manual', priceUpdatedAt: '2026-11-16', unitPrice: { amount: 0.5, unit: 'un' }, actualCheckoutQuantity: 4 }];
    const selected = selectProduct('rice', 3.2, fakeCalcPlan(catalogue).profile, catalogue, '2026-11-16');
    expect(selected).toMatchObject({ status: 'selected', checkoutCents: 200, expectedCheckoutCents: 200, checkoutQuantity: 4, checkoutQuantityKnown: true });
  });

  it('accepts a valid zero-price product as a known price', () => {
    const catalogue = fakeCalcCatalogue();
    catalogue.products = [ { ...catalogue.products[0]!, price: 0, priceState: 'manual', priceUpdatedAt: '2026-11-16' } ];
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.subtotalKnownCents).toBe(0);
    expect(basket.hasUnknown).toBe(false);
    expect(getBudgetStatus(basket, 0)).toBe('dentro');
  });

  it('consolidates repeated recipes and scales them for household size', () => {
    const catalogue = fakeCalcCatalogue();
    const plan = fakeCalcPlan(catalogue);
    plan.profile.people = 3;
    plan.days[0]?.slots.push({ mealType: 'almoco', recipeId: 'rice-recipe', locked: false });
    expect(consolidateNeeds(plan, catalogue)[0]?.quantity).toBe(900);
  });

  it('ranks known prices before cheaper estimates and unknown prices', () => {
    const catalogue = fakeCalcCatalogue();
    const selected = selectProduct('rice', 300, fakeCalcPlan(catalogue).profile, catalogue, '2026-11-16');
    expect(selected.status === 'selected' && selected.product.id).toBe('rice-c-cheap');
  });

  it('rejects an allergen-unsafe override, even if it is cheaper', () => {
    const catalogue = fakeCalcCatalogue();
    const unsafe = { ...fakeDietUnsafeProduct(catalogue.products[0]!), id: 'rice-unsafe' };
    catalogue.products.unshift(unsafe);
    const plan = fakeCalcPlan(catalogue);
    plan.profile.allergens = ['peixe'];
    plan.productOverrides.rice = unsafe.id;
    const result = computeBasket(plan, catalogue, '2026-11-16');
    expect(result.lines[0]?.selection).toEqual({ status: 'unavailable', reason: 'unsafe_override' });
    expect(result.lines[0]?.selection.status).toBe('unavailable');
    expect(getBudgetStatus(result, 10000)).toBe('incompleto');
  });

  it('does not select a diet-incompatible override', () => {
    const catalogue = fakeCalcCatalogue();
    const unsafe = { ...catalogue.products[0]!, id: 'not-vegan', dietCompatibility: { ...catalogue.ingredients[0]!.dietCompatibility, vegana: 'incompativel' as const } };
    catalogue.products.unshift(unsafe);
    const profile = fakeCalcPlan(catalogue).profile;
    profile.dietaryRule = 'vegana';
    expect(selectProduct('rice', 100, profile, catalogue, '2026-11-16', unsafe.id)).toMatchObject({ status: 'unavailable', reason: 'unsafe_override' });
  });

  it('owned ingredients have no checkout cost but retain consumption cost', () => {
    const catalogue = fakeCalcCatalogue();
    const plan = fakeCalcPlan(catalogue);
    plan.profile.ownedIngredientIds = ['rice'];
    const basket = computeBasket(plan, catalogue, '2026-11-16');
    expect(basket.lines[0]?.checkoutCents).toBe(0);
    expect(basket.consumptionTotalCents).toBe(60);
    expect(basket.estimatedTotalCents).toBe(0);
  });

  it('keeps unknown prices separate and never treats them as zero', () => {
    const catalogue = fakeCalcCatalogue();
    catalogue.products = catalogue.products.filter((product) => product.id === 'rice-c-unknown');
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.estimatedTotalCents).toBe(0);
    expect(basket.unknownLines).toHaveLength(1);
    expect(getBudgetStatus(basket, 10000)).toBe('incompleto');
  });

  it('marks an ingredient unavailable when it has no products', () => {
    const catalogue = fakeCalcCatalogue();
    catalogue.products = [];
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.hasUnavailable).toBe(true);
    expect(getBudgetStatus(basket, 10000)).toBe('incompleto');
  });

  it('keeps an owned unknown-price product out of checkout while consumption remains incomplete', () => {
    const catalogue = fakeCalcCatalogue();
    catalogue.products = catalogue.products.filter((product) => product.id === 'rice-c-unknown');
    const plan = fakeCalcPlan(catalogue);
    plan.profile.ownedIngredientIds = ['rice'];
    const basket = computeBasket(plan, catalogue, '2026-11-16');
    expect(basket.hasUnknown).toBe(false);
    expect(basket.unknownLines).toHaveLength(0);
    expect(basket.lines[0]?.checkoutCents).toBe(0);
    expect(basket.lines[0]?.consumptionCents).toBeNull();
    expect(basket.consumptionIncomplete).toBe(true);
    expect(getBudgetStatus(basket, 0)).toBe('dentro');
  });

  it('computes estimate ranges only when bounded and no unknown checkout line exists', () => {
    const catalogue = fakeCalcCatalogue();
    catalogue.products = catalogue.products.filter((product) => product.id === 'rice-c-cheap').map((product) => fakeEstimate(product));
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.rangeCents).toEqual({ low: 150, high: 250 });
    expect(getBudgetStatus(basket, 200)).toBe('incerto');
  });

  it('adds known checkout costs to both estimate bounds', () => {
    const catalogue = fakeCalcCatalogue();
    const base = catalogue.products.find((product) => product.id === 'rice-c-cheap');
    const other = catalogue.products.find((product) => product.id === 'rice-c-costly');
    catalogue.products = [
      ...(base ? [fakeEstimate(base)] : []),
      ...(other ? [other] : []),
    ];
    if (other) other.ingredientId = 'other';
    catalogue.ingredients.push({ ...catalogue.ingredients[0]!, id: 'other', name: 'Outro' });
    catalogue.recipes[0]!.ingredients.push({ ingredientId: 'other', amount: 100, unit: 'g' });
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.rangeCents).toEqual({ low: 450, high: 550 });
  });

  it('requires complete bounds for every estimate in a range', () => {
    const catalogue = fakeCalcCatalogue();
    const first = catalogue.products.find((product) => product.id === 'rice-c-cheap');
    const second = catalogue.products.find((product) => product.id === 'rice-c-estimate');
    catalogue.products = [
      ...(first ? [fakeEstimate(first)] : []),
      ...(second ? [{ ...second, id: 'rice-second-estimate', ingredientId: 'other', estimate: { value: 0.75, enteredAt: '2026-11-16' } }] : []),
    ];
    catalogue.ingredients.push({ ...catalogue.ingredients[0]!, id: 'other', name: 'Outro' });
    catalogue.recipes[0]!.ingredients.push({ ingredientId: 'other', amount: 100, unit: 'g' });
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.hasEstimate).toBe(true);
    expect(basket.rangeCents).toBeNull();

    const secondEstimate = catalogue.products.find((product) => product.id === 'rice-second-estimate');
    if (secondEstimate?.priceState === 'estimativa' && secondEstimate.estimate) {
      secondEstimate.estimate = { ...secondEstimate.estimate, low: 0.5, high: 1 };
    }
    const boundedBasket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(boundedBasket.rangeCents).toEqual({ low: 200, high: 350 });
  });

  it('suppresses an estimate range when an unknown-price checkout line exists', () => {
    const catalogue = fakeCalcCatalogue();
    const estimateProduct = catalogue.products.find((product) => product.id === 'rice-c-cheap');
    const unknownProduct = catalogue.products.find((product) => product.id === 'rice-c-unknown');
    catalogue.products = [
      ...(estimateProduct ? [fakeEstimate(estimateProduct)] : []),
      ...(unknownProduct ? [{ ...unknownProduct, ingredientId: 'other' }] : []),
    ];
    catalogue.ingredients.push({ ...catalogue.ingredients[0]!, id: 'other', name: 'Outro' });
    catalogue.recipes[0]!.ingredients.push({ ingredientId: 'other', amount: 100, unit: 'g' });
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.hasUnknown).toBe(true);
    expect(basket.rangeCents).toBeNull();
    expect(getBudgetStatus(basket, 100000)).toBe('incompleto');
  });

  it('uses a promotion only through its validity date', () => {
    const catalogue = fakeCalcCatalogue();
    catalogue.products[0] = { ...catalogue.products[0]!, promo: { price: 1, validUntil: '2026-11-16' } };
    expect(computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16').estimatedTotalCents).toBe(100);
    expect(computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-17').estimatedTotalCents).toBe(200);
  });

  it('rejects a manual override from the other supermarket without falling back', () => {
    const catalogue = fakeCalcCatalogue();
    const plan = fakeCalcPlan(catalogue);
    plan.productOverrides.rice = 'rice-pd';
    const basket = computeBasket(plan, catalogue, '2026-11-16');
    expect(basket.lines[0]?.selection).toEqual({ status: 'unavailable', reason: 'unsafe_override' });
    expect(basket.hasUnavailable).toBe(true);
  });

  it('returns dentro when a fully known total equals the budget', () => {
    const catalogue = fakeCalcCatalogue();
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    expect(basket.estimatedTotalCents).toBe(200);
    expect(getBudgetStatus(basket, 200)).toBe('dentro');
  });

  it('does not let consumption-only changes affect budget status', () => {
    const catalogue = fakeCalcCatalogue();
    const basket = computeBasket(fakeCalcPlan(catalogue), catalogue, '2026-11-16');
    const initial = getBudgetStatus(basket, 200);
    expect(getBudgetStatus({ ...basket, consumptionTotalCents: basket.consumptionTotalCents + 100000 }, 200)).toBe(initial);
  });

  it('does not return dentro with estimates, unavailable items, or uncertain quantities', () => {
    const basket = computeBasket(fakeCalcPlan(fakeCalcCatalogue()), fakeCalcCatalogue(), '2026-11-16');
    expect(getBudgetStatus({ ...basket, hasEstimate: true }, 100000)).toBe('provavel_dentro');
    expect(getBudgetStatus({ ...basket, hasUnavailable: true }, 100000)).toBe('incompleto');
    expect(getBudgetStatus({ ...basket, hasUncertainQuantity: true }, 100000)).toBe('incompleto');
  });

  it('runs 200 seeded money conversions without leaving integer cents', () => {
    const random = createSeededRandom(71827);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const cents = Math.floor(random() * 100000);
      expect(toCents(cents / 100)).toBe(cents);
    }
  });

  it('rejects invalid decimal precision and unsafe monetary magnitudes', () => {
    expect(() => toCents(1.001)).toThrow(RangeError);
    expect(() => toCents(Number.NaN)).toThrow(RangeError);
    expect(() => toCents(100000000000000)).toThrow(RangeError);
    expect(toCents(1.01)).toBe(101);
    expect(toCents(0)).toBe(0);
  });
});
