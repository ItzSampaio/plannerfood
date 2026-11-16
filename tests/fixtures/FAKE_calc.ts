import type { Catalogue, Plan, Product } from '../../src/lib/types';
import { fakeManualPrice, fakeEstimatedPrice, FAKE_PRICE_UPDATED_AT } from './FAKE_prices';

export function fakeCalcCatalogue(): Catalogue {
  const ingredients = [{
    id: 'rice', name: 'Arroz', category: 'hidratos' as const, baseUnit: 'g' as const,
    allergens: [], dietCompatibility: { vegetariana: 'compativel' as const, vegana: 'compativel' as const, sem_gluten: 'compativel' as const, sem_lactose: 'compativel' as const },
    isNeutral: false,
  }];
  const recipe = {
    id: 'rice-recipe', name: 'Arroz', description: '', mealTypes: ['almoco' as const], baseServings: 2, prepMinutes: 10, tags: [],
    ingredients: [{ ingredientId: 'rice', amount: 300, unit: 'g' as const }], steps: ['Cozer.'], declaredAllergens: [],
    declaredDietCompatibility: ingredients[0].dietCompatibility,
  };
  const base: Product = {
    id: 'rice-c-cheap', name: 'Arroz A', supermarketId: 'continente', ingredientId: 'rice', packSize: 1000, unit: 'g',
    price: null, priceState: 'desconhecido', priceUpdatedAt: null, allergens: [], dietCompatibility: ingredients[0].dietCompatibility,
  };
  const products = [
    fakeManualPrice(base, 2),
    fakeManualPrice({ ...base, id: 'rice-c-costly', name: 'Arroz B' }, 3),
    { ...base, id: 'rice-c-estimate', priceState: 'estimativa' as const, estimate: { value: 0.5, low: 0.4, high: 0.6, enteredAt: FAKE_PRICE_UPDATED_AT } },
    { ...base, id: 'rice-c-unknown' },
    { ...base, id: 'rice-pd', supermarketId: 'pingo_doce' as const },
  ];
  return { ingredients, recipes: [recipe], products };
}

export function fakeCalcPlan(catalogue: Catalogue): Plan {
  return {
    id: 'plan', createdAt: FAKE_PRICE_UPDATED_AT,
    profile: { supermarketId: 'continente', people: 2, mealTypes: ['almoco'], dietaryRule: 'nenhuma', allergens: [], exclusionText: [], ownedIngredientIds: [], priority: 'mais_barato', weeklyBudget: 20 },
    days: [{ day: 'segunda', slots: [{ mealType: 'almoco', recipeId: catalogue.recipes[0]?.id ?? '', locked: false }] }],
    productOverrides: {}, purchased: {},
  };
}

export function fakeDietUnsafeProduct(product: Product): Product {
  return { ...product, allergens: ['peixe'] };
}

export function fakeEstimate(product: Product): Product {
  return fakeEstimatedPrice(product, { value: 2, low: 1.5, high: 2.5, enteredAt: FAKE_PRICE_UPDATED_AT });
}
