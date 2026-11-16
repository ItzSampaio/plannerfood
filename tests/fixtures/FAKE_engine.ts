import type { Catalogue, Ingredient, Plan, Product, Recipe, UserProfile } from '../../src/lib/types';
import { fakeManualPrice, FAKE_PRICE_UPDATED_AT } from './FAKE_prices';

const diet = { vegetariana: 'compativel', vegana: 'compativel', sem_gluten: 'compativel', sem_lactose: 'compativel' } as const;
const baseIngredient: Ingredient = {
  id: 'rice', name: 'Arroz', category: 'hidratos', baseUnit: 'g', allergens: [], dietCompatibility: diet, isNeutral: false,
};

export function engineRecipe(id: string, overrides: Partial<Recipe> = {}): Recipe {
  return {
    id, name: `Prato ${id}`, description: 'Receita de teste.', mealTypes: ['almoco'], baseServings: 2,
    prepMinutes: 20, tags: [], ingredients: [{ ingredientId: 'rice', amount: 100, unit: 'g' }],
    steps: ['Preparar o arroz.'], declaredAllergens: [], declaredDietCompatibility: { ...diet }, ...overrides,
  };
}

export function engineCatalogue(recipes = ['a', 'b', 'c', 'd'].map((id) => engineRecipe(id))): Catalogue {
  const base: Product = {
    id: 'rice-product', name: 'Arroz de teste', supermarketId: 'continente', ingredientId: 'rice', packSize: 1000, unit: 'g',
    price: null, priceState: 'desconhecido', priceUpdatedAt: null, allergens: [], dietCompatibility: { ...diet },
  };
  return { ingredients: [baseIngredient], recipes, products: [fakeManualPrice(base, 1)] };
}

export function engineProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    supermarketId: 'continente', people: 2, mealTypes: ['almoco'], dietaryRule: 'nenhuma', allergens: [],
    exclusionText: [], ownedIngredientIds: [], priority: 'mais_barato', weeklyBudget: 50, ...overrides,
  };
}

export function enginePlan(catalogue: Catalogue, overrides: Partial<UserProfile> = {}): Plan {
  const profile = engineProfile(overrides);
  return {
    id: 'engine-plan', createdAt: FAKE_PRICE_UPDATED_AT, profile,
    days: Array.from({ length: 7 }, (_, dayIndex) => ({
      day: (['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'] as const)[dayIndex] ?? 'segunda',
      slots: dayIndex === 0 && catalogue.recipes[0] ? [{ mealType: catalogue.recipes[0].mealTypes[0] ?? 'almoco', recipeId: catalogue.recipes[0].id, locked: false }] : [],
    })),
    productOverrides: {}, purchased: {},
  };
}

export const ENGINE_DIET_COMPATIBILITY = diet;
