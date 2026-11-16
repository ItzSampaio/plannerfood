import { describe, expect, it } from 'vitest';
import type { Ingredient, Product, Recipe, UserProfile } from '../../src/lib/types';
import { deriveRecipeAllergens, isAllergenInfoSafe, isIngredientSafe, isRecipeAllergenSafe } from '../../src/lib/safety/allergens';
import { deriveRecipeDiet, isIngredientDietOk, isProductDietOk, isDietOk } from '../../src/lib/safety/diet';
import { isIngredientAvailable, isProductOverrideSafe, isProductSafe, safeProductsFor } from '../../src/lib/safety/products';

const compatibility = { vegetariana: 'compativel', vegana: 'compativel', sem_gluten: 'compativel', sem_lactose: 'compativel' } as const;
const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  supermarketId: 'continente', people: 2, mealTypes: ['almoco'], dietaryRule: 'vegana', allergens: [],
  exclusionText: [], ownedIngredientIds: [], priority: 'mais_barato', weeklyBudget: 50, ...overrides,
});
const ingredient = (overrides: Partial<Ingredient> = {}): Ingredient => ({
  id: 'sal', name: 'Sal', category: 'despensa', baseUnit: 'g', allergens: [],
  dietCompatibility: compatibility, isNeutral: true, ...overrides,
});
const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'sal_continente', name: 'Sal genérico', supermarketId: 'continente', ingredientId: 'sal', packSize: 500,
  unit: 'g', price: null, priceState: 'desconhecido', priceUpdatedAt: null, allergens: [],
  dietCompatibility: compatibility, ...overrides,
});
const recipe = (overrides: Partial<Recipe> = {}): Recipe => ({
  id: 'receita', name: 'Receita', description: 'Receita de teste', mealTypes: ['almoco'], baseServings: 2,
  prepMinutes: 10, tags: [], ingredients: [{ ingredientId: 'sal', amount: 5, unit: 'g' }], steps: ['Preparar.'],
  declaredAllergens: [], declaredDietCompatibility: { ...compatibility }, ...overrides,
});

describe('allergen safety', () => {
  it('fails closed for unknown allergen data when an allergy is declared', () => {
    const allergicProfile = profile({ allergens: ['gluten'] });
    expect(isAllergenInfoSafe('unknown', allergicProfile)).toBe(false);
    expect(isIngredientSafe(ingredient({ allergens: 'unknown' }), allergicProfile)).toBe(false);
  });

  it('does not treat unknown allergen data as unsafe when no allergy was declared', () => {
    expect(isAllergenInfoSafe('unknown', profile())).toBe(true);
  });

  it('checks neutral ingredients against allergens at ingredient and product level', () => {
    const celerySalt = ingredient({ allergens: ['aipo'], isNeutral: true });
    const celeryProfile = profile({ allergens: ['aipo'] });
    expect(isIngredientSafe(celerySalt, celeryProfile)).toBe(false);
    expect(isIngredientSafe(ingredient({ allergens: 'unknown', isNeutral: true }), celeryProfile)).toBe(false);
    expect(isProductSafe(product({ allergens: ['aipo'] }), celerySalt, celeryProfile)).toBe(false);
    expect(isProductSafe(product({ allergens: 'unknown' }), ingredient(), celeryProfile)).toBe(false);
    expect(isProductOverrideSafe(product({ allergens: 'unknown' }), ingredient(), celeryProfile)).toBe(false);
  });

  it('derives recipe allergens from ingredients and checks the declared set too', () => {
    const wheat = ingredient({ id: 'trigo', name: 'Trigo', isNeutral: false, allergens: ['gluten'] });
    const wheatRecipe = recipe({ ingredients: [{ ingredientId: 'trigo', amount: 80, unit: 'g' }], declaredAllergens: ['gluten'] });
    expect(deriveRecipeAllergens(wheatRecipe, [wheat])).toEqual(['gluten']);
    expect(isRecipeAllergenSafe(wheatRecipe, [wheat], profile({ allergens: ['gluten'] }))).toBe(false);
  });

  it('fails closed when a recipe ingredient has unknown allergens for an allergic profile', () => {
    const unknown = ingredient({ id: 'misterioso', name: 'Ingrediente por confirmar', isNeutral: false, allergens: 'unknown' });
    const unknownRecipe = recipe({ ingredients: [{ ingredientId: unknown.id, amount: 20, unit: 'g' }], declaredAllergens: 'unknown' });
    expect(isRecipeAllergenSafe(unknownRecipe, [unknown], profile({ allergens: ['gluten'] }))).toBe(false);
  });

  it('rejects an allergen-safe but diet-incompatible product override', () => {
    const dairy = ingredient({ id: 'leite', name: 'Leite', isNeutral: false, dietCompatibility: { ...compatibility, vegana: 'incompativel' } });
    const dairyProduct = product({ id: 'leite_c', ingredientId: 'leite', dietCompatibility: { ...compatibility, vegana: 'incompativel' } });
    const vegan = profile({ dietaryRule: 'vegana' });
    expect(isProductSafe(dairyProduct, dairy, vegan)).toBe(true);
    expect(isProductDietOk(dairyProduct, dairy, 'vegana')).toBe(false);
    expect(isProductOverrideSafe(dairyProduct, dairy, vegan)).toBe(false);
  });

  it('rejects a diet-compatible but allergen-unsafe product override', () => {
    const grain = ingredient({ id: 'aveia', name: 'Aveia', isNeutral: false });
    const contaminatedProduct = product({ id: 'aveia_c', ingredientId: 'aveia', allergens: ['gluten'] });
    const glutenAllergic = profile({ dietaryRule: 'vegana', allergens: ['gluten'] });
    expect(isProductDietOk(contaminatedProduct, grain, 'vegana')).toBe(true);
    expect(isProductSafe(contaminatedProduct, grain, glutenAllergic)).toBe(false);
    expect(isProductOverrideSafe(contaminatedProduct, grain, glutenAllergic)).toBe(false);
  });

  it('rejects a safe product override from a different supermarket', () => {
    const rice = ingredient({ id: 'arroz', name: 'Arroz', isNeutral: false });
    const otherMarket = product({ id: 'arroz_pd', ingredientId: 'arroz', supermarketId: 'pingo_doce' });
    expect(isProductSafe(otherMarket, rice, profile())).toBe(true);
    expect(isProductDietOk(otherMarket, rice, 'vegana')).toBe(true);
    expect(isProductOverrideSafe(otherMarket, rice, profile())).toBe(false);
  });

  it('does not let neutral ingredients bypass product-level dietary restrictions', () => {
    const salt = ingredient({ isNeutral: true, dietCompatibility: { ...compatibility, vegana: 'incompativel' } });
    const restrictedSaltProduct = product({ dietCompatibility: { ...compatibility, vegana: 'incompativel' } });
    expect(isProductDietOk(restrictedSaltProduct, salt, 'vegana')).toBe(false);
    expect(isProductDietOk(product(), salt, 'vegana')).toBe(true);
  });

  it('rejects unknown product dietary compatibility for an active diet', () => {
    const oats = ingredient({ id: 'aveia', name: 'Aveia', isNeutral: false });
    const unknownDietProduct = product({ ingredientId: 'aveia', dietCompatibility: { ...compatibility, vegana: 'desconhecido' } });
    expect(isProductDietOk(unknownDietProduct, oats, 'vegana')).toBe(false);
  });

  it('filters safe products by supermarket, allergies, and dietary compatibility', () => {
    const grain = ingredient({ id: 'aveia', name: 'Aveia', isNeutral: false });
    const catalogue = {
      ingredients: [grain], recipes: [], products: [
        product({ id: 'safe', ingredientId: 'aveia' }),
        product({ id: 'other_market', ingredientId: 'aveia', supermarketId: 'pingo_doce' }),
        product({ id: 'unknown_allergen', ingredientId: 'aveia', allergens: 'unknown' }),
        product({ id: 'unknown_diet', ingredientId: 'aveia', dietCompatibility: { ...compatibility, vegana: 'desconhecido' } }),
      ],
    };
    expect(safeProductsFor('aveia', profile({ allergens: ['gluten'] }), catalogue).map((entry) => entry.id)).toEqual(['safe']);
    expect(safeProductsFor('aveia', profile(), catalogue).map((entry) => entry.id)).toEqual(['safe', 'unknown_allergen']);
  });

  it('derives neutral diet compatibility without allowing unknown non-neutral status', () => {
    const unknown = ingredient({ id: 'produto', name: 'Produto', isNeutral: false, dietCompatibility: { ...compatibility, vegana: 'desconhecido' } });
    const meal = recipe({ ingredients: [{ ingredientId: 'sal', amount: 1, unit: 'g' }, { ingredientId: 'produto', amount: 10, unit: 'g' }] });
    expect(deriveRecipeDiet(meal, [ingredient(), unknown]).vegana).toBe('desconhecido');
    expect(isIngredientDietOk(unknown, profile())).toBe(false);
  });

  it('allows neutral salt and water in an otherwise vegan-compatible recipe', () => {
    const water = ingredient({ id: 'agua', name: 'Água', baseUnit: 'ml', isNeutral: true });
    const veganMeal = recipe({ ingredients: [
      { ingredientId: 'sal', amount: 2, unit: 'g' },
      { ingredientId: 'agua', amount: 200, unit: 'ml' },
    ] });
    const status = deriveRecipeDiet(veganMeal, [ingredient(), water]).vegana;
    expect(status).toBe('compativel');
    expect(isDietOk(status, 'vegana')).toBe(true);
  });

  it('marks an ingredient unavailable when all products fail the shared safety checks', () => {
    const wheat = ingredient({ id: 'trigo', name: 'Trigo', allergens: ['gluten'], isNeutral: false });
    const unsafeProduct = product({ ingredientId: 'trigo', allergens: ['gluten'] });
    const glutenAllergic = profile({ allergens: ['gluten'] });
    const catalogue = { ingredients: [wheat], recipes: [], products: [unsafeProduct] };
    expect(safeProductsFor('trigo', glutenAllergic, catalogue)).toEqual([]);
    expect(isIngredientAvailable('trigo', glutenAllergic, catalogue)).toBe(false);
    const unknownGrain = ingredient({ id: 'desconhecido', name: 'Ingrediente por confirmar', allergens: 'unknown', isNeutral: false });
    const unknownCatalogue = { ingredients: [unknownGrain], recipes: [], products: [product({ ingredientId: 'desconhecido' })] };
    expect(safeProductsFor('desconhecido', glutenAllergic, unknownCatalogue)).toEqual([]);
    expect(isIngredientAvailable('desconhecido', glutenAllergic, unknownCatalogue)).toBe(false);
  });
});
