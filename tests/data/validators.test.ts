import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALLERGENS, type Allergen, type AllergenInfo, type Catalogue, type DietCompatibility, type DietStatus, type Ingredient, type Product, type Recipe } from '../../src/lib/types';
import { validateCatalogue, validateIngredients, validateProducts, validateRecipes } from '../../src/lib/data/validators';
import { safeProductsFor } from '../../src/lib/safety/products';
import { deriveRecipeAllergens } from '../../src/lib/safety/allergens';
import { deriveRecipeDiet, isDietOk } from '../../src/lib/safety/diet';
import { createSeededRandom } from '../fixtures/seededRandom';
import { FAKE_BASE_PRICE, FAKE_ESTIMATE_ENTERED_AT, FAKE_ESTIMATE_HIGH, FAKE_ESTIMATE_INVERTED_HIGH, FAKE_ESTIMATE_INVERTED_LOW, FAKE_ESTIMATE_LOW, FAKE_ESTIMATE_VALUE, FAKE_PRICE_THREE_DECIMALS, fakeBoundedEstimate, fakeCentsPrice, fakeEstimatedPrice, fakeEstimateWithKnownPrice, fakeEstimateWithoutEnteredAt, fakeManualPrice, fakeManualWithEstimate, fakeManualWithInvalidPromo, fakeManualWithInvalidPromoDate, fakeManualWithPromo, fakePartialEstimate, fakeSubcentPrice, fakeUnknownWithDate, fakeUnknownWithEstimate, fakeUnknownWithPrice, fakeVerifiedPrice, fakeVerifiedWithoutDate } from '../fixtures/FAKE_prices';

const catalogue = JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/ingredients.json'), 'utf8')) as Catalogue['ingredients'];
const recipes = JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/recipes.json'), 'utf8')) as Catalogue['recipes'];
const products = JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/products.json'), 'utf8')) as Product[];
const genericProducts = products.filter((item) => item.catalogueSource === undefined || item.catalogueSource === 'generic_seed');
const data: Catalogue = { ingredients: catalogue, recipes, products };
const knownProduct = (): Product => fakeManualPrice(products[0], FAKE_BASE_PRICE);
const allCompatible: DietCompatibility = { vegetariana: 'compativel', vegana: 'compativel', sem_gluten: 'compativel', sem_lactose: 'compativel' };
const syntheticIngredient = (id: string, allergens: AllergenInfo, dietCompatibility = allCompatible, isNeutral = false): Ingredient => ({
  id, name: 'Ingrediente de teste', category: 'despensa', baseUnit: 'g', allergens, dietCompatibility, isNeutral,
});
const syntheticRecipe = (id: string, ingredient: Ingredient, declaredAllergens: AllergenInfo, declaredDietCompatibility = ingredient.dietCompatibility): Recipe => ({
  id, name: 'Receita de teste', description: 'Receita para validar o catálogo.', mealTypes: ['almoco'], baseServings: 2,
  prepMinutes: 10, tags: [], ingredients: [{ ingredientId: ingredient.id, amount: 50, unit: 'g' }], steps: ['Cozinhar.'],
  declaredAllergens, declaredDietCompatibility,
});

describe('catalogue validators', () => {
  it('accepts the shipped catalogue, all four meal types, and fully unknown seed prices', () => {
    expect(validateCatalogue(data)).toEqual({ ok: true });
    expect(new Set(recipes.flatMap((item) => item.mealTypes))).toEqual(new Set(['pequeno_almoco', 'almoco', 'jantar', 'lanche']));
    expect(genericProducts).toHaveLength(80);
    expect(genericProducts.every((item) => item.price === null && item.priceState === 'desconhecido')).toBe(true);
    expect(products.filter((item) => item.catalogueSource === 'cesta_mcp')).toHaveLength(2);
    expect(genericProducts.every((item) => item.name.startsWith('Produto genérico — '))).toBe(true);
  });

  it('checks price state invariants across seeded valid and invalid cases', () => {
    const random = createSeededRandom(1009);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const seed = Math.floor(random() * 1_000_000);
      const good = fakeManualPrice(products[0], fakeCentsPrice(seed));
      expect(validateProducts([good], catalogue).ok).toBe(true);
      const bad = fakeManualPrice(products[0], fakeSubcentPrice(seed));
      expect(validateProducts([bad], catalogue).ok).toBe(false);
    }
  });

  it('property-checks valid and invalid records for all four price states', () => {
    const random = createSeededRandom(1741);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const seed = Math.floor(random() * 1_000_000);
      const price = fakeCentsPrice(seed);
      const validRows = [
        fakeManualPrice(products[0], price),
        fakeVerifiedPrice(products[0], price),
        fakeEstimatedPrice(products[0], fakeBoundedEstimate(seed)),
        products[0],
      ];
      for (const row of validRows) expect(validateProducts([row], catalogue).ok).toBe(true);
      expect(validateProducts([fakeManualPrice(products[0], fakeSubcentPrice(seed))], catalogue).ok).toBe(false);
      expect(validateProducts([fakeVerifiedPrice(products[0], price)], catalogue).ok).toBe(true);
      expect(validateProducts([fakeVerifiedWithoutDate(products[0])], catalogue).ok).toBe(false);
      expect(validateProducts([fakeEstimatedPrice(products[0], fakePartialEstimate(seed))], catalogue).ok).toBe(false);
      expect(validateProducts([fakeUnknownWithPrice(products[0])], catalogue).ok).toBe(false);
    }
  });

  it('enforces verified and unknown price-state fields', () => {
    const manual = knownProduct();
    const verified = fakeVerifiedPrice(products[0]);
    const unknown = products[0];
    expect(validateProducts([manual], catalogue).ok).toBe(true);
    expect(validateProducts([verified], catalogue).ok).toBe(true);
    expect(validateProducts([{ ...manual, priceUpdatedAt: null }], catalogue).ok).toBe(false);
    expect(validateProducts([fakeManualWithEstimate(products[0])], catalogue).ok).toBe(false);
    expect(validateProducts([fakeManualPrice(products[0], FAKE_PRICE_THREE_DECIMALS)], catalogue).ok).toBe(false);
    expect(validateProducts([unknown], catalogue).ok).toBe(true);
    expect(validateProducts([fakeUnknownWithPrice(unknown)], catalogue).ok).toBe(false);
    expect(validateProducts([fakeUnknownWithEstimate(unknown)], catalogue).ok).toBe(false);
    expect(validateProducts([fakeUnknownWithDate(unknown)], catalogue).ok).toBe(false);
  });

  it('rejects incomplete, inverted, or value-excluding estimate ranges', () => {
    const base = fakeEstimatedPrice(products[0], { value: FAKE_ESTIMATE_VALUE, enteredAt: FAKE_ESTIMATE_ENTERED_AT });
    expect(validateProducts([base], catalogue).ok).toBe(true);
    expect(validateProducts([fakeEstimatedPrice(products[0], { value: FAKE_ESTIMATE_VALUE, low: FAKE_ESTIMATE_LOW, enteredAt: FAKE_ESTIMATE_ENTERED_AT })], catalogue).ok).toBe(false);
    expect(validateProducts([fakeEstimatedPrice(products[0], { value: FAKE_ESTIMATE_VALUE, low: FAKE_ESTIMATE_INVERTED_LOW, high: FAKE_ESTIMATE_INVERTED_HIGH, enteredAt: FAKE_ESTIMATE_ENTERED_AT })], catalogue).ok).toBe(false);
    expect(validateProducts([fakeEstimatedPrice(products[0], { value: FAKE_ESTIMATE_VALUE, low: FAKE_ESTIMATE_LOW, high: FAKE_ESTIMATE_HIGH, enteredAt: FAKE_ESTIMATE_ENTERED_AT })], catalogue).ok).toBe(true);
    expect(validateProducts([fakeEstimateWithKnownPrice(products[0])], catalogue).ok).toBe(false);
    expect(validateProducts([fakeEstimateWithoutEnteredAt(products[0])], catalogue).ok).toBe(false);
  });

  it('accepts only valid promotions on known prices', () => {
    expect(validateProducts([fakeManualWithPromo(products[0])], catalogue).ok).toBe(true);
    expect(validateProducts([fakeManualWithInvalidPromo(products[0])], catalogue).ok).toBe(false);
    expect(validateProducts([fakeManualWithInvalidPromoDate(products[0])], catalogue).ok).toBe(false);
    expect(validateProducts([{ ...products[0], promo: { price: 1, validUntil: '2026-12-01' } }], catalogue).ok).toBe(false);
  });

  it('property-checks allergen derivation, under/over-declaration, and unknown propagation for 200 inputs', () => {
    const random = createSeededRandom(2887);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const firstIndex = Math.floor(random() * ALLERGENS.length);
      const secondIndex = (firstIndex + 1 + Math.floor(random() * (ALLERGENS.length - 1))) % ALLERGENS.length;
      let extraIndex = Math.floor(random() * ALLERGENS.length);
      while (extraIndex === firstIndex || extraIndex === secondIndex) extraIndex = (extraIndex + 1) % ALLERGENS.length;
      const first = ALLERGENS[firstIndex];
      const second = ALLERGENS[secondIndex];
      const extra = ALLERGENS[extraIndex];
      const ingredients = [syntheticIngredient(`first_${iteration}`, [first]), syntheticIngredient(`second_${iteration}`, [second])];
      const recipe: Recipe = {
        ...syntheticRecipe(`known_${iteration}`, ingredients[0], [first, second]),
        ingredients: [
          { ingredientId: ingredients[0].id, amount: 30, unit: 'g' },
          { ingredientId: ingredients[1].id, amount: 20, unit: 'g' },
        ],
      };
      expect(deriveRecipeAllergens(recipe, ingredients)).toEqual([first, second].sort());
      expect(validateRecipes([recipe], ingredients).ok).toBe(true);
      expect(validateRecipes([{ ...recipe, declaredAllergens: [first] }], ingredients).ok).toBe(false);
      expect(validateRecipes([{ ...recipe, declaredAllergens: [first, second, extra] }], ingredients).ok).toBe(false);

      const unknownIngredient = syntheticIngredient(`unknown_${iteration}`, 'unknown');
      const unknownRecipe = syntheticRecipe(`unknown_recipe_${iteration}`, unknownIngredient, 'unknown');
      expect(validateRecipes([unknownRecipe], [unknownIngredient]).ok).toBe(true);
      expect(validateRecipes([{ ...unknownRecipe, declaredAllergens: [] }], [unknownIngredient]).ok).toBe(false);
      expect(validateCatalogue({ ingredients: [unknownIngredient], recipes: [unknownRecipe], products: [] }).ok).toBe(false);
    }
  });

  it('property-checks neutral and unknown dietary derivation over 200 seeded compatibility records', () => {
    const statuses: DietStatus[] = ['compativel', 'incompativel', 'desconhecido'];
    const random = createSeededRandom(3967);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const status = statuses[Math.floor(random() * statuses.length)];
      const diet = { ...allCompatible, vegana: status };
      const item = syntheticIngredient(`diet_${iteration}`, [], diet);
      const itemRecipe = syntheticRecipe(`diet_recipe_${iteration}`, item, [] as Allergen[], diet);
      expect(deriveRecipeDiet(itemRecipe, [item]).vegana).toBe(status);
      expect(validateRecipes([itemRecipe], [item]).ok).toBe(true);
      expect(isDietOk(status, 'vegana')).toBe(status === 'compativel');

      const neutral = syntheticIngredient(`neutral_${iteration}`, [], { ...allCompatible, vegana: status }, true);
      const neutralRecipe = syntheticRecipe(`neutral_recipe_${iteration}`, neutral, [] as Allergen[], allCompatible);
      expect(deriveRecipeDiet(neutralRecipe, [neutral])).toEqual(allCompatible);
      expect(validateRecipes([neutralRecipe], [neutral]).ok).toBe(true);
    }
  });

  it('property-checks product allergen superset rules for 200 EU-14 pairs', () => {
    const random = createSeededRandom(4931);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const requiredIndex = Math.floor(random() * ALLERGENS.length);
      const additionalIndex = (requiredIndex + 1 + Math.floor(random() * (ALLERGENS.length - 1))) % ALLERGENS.length;
      const required: Allergen = ALLERGENS[requiredIndex];
      const additional: Allergen = ALLERGENS[additionalIndex];
      const ingredient = syntheticIngredient(`product_ingredient_${iteration}`, [required]);
      const base = { ...products[0], ingredientId: ingredient.id, allergens: [required, additional] };
      expect(validateProducts([base], [ingredient]).ok).toBe(true);
      expect(validateProducts([{ ...base, allergens: [additional] }], [ingredient]).ok).toBe(false);
    }
  });

  it('rejects products that understate ingredient allergens or overstate diet compatibility', () => {
    const milk = catalogue.find((item) => item.id === 'leite');
    const milkProduct = products.find((item) => item.ingredientId === 'leite');
    expect(milk).toBeDefined();
    expect(milkProduct).toBeDefined();
    expect(validateProducts([{ ...milkProduct!, allergens: [] }], [milk]).ok).toBe(false);
    expect(validateProducts([{ ...milkProduct!, dietCompatibility: { ...milkProduct!.dietCompatibility, vegana: 'compativel' } }], [milk]).ok).toBe(false);
    const neutralSalt = syntheticIngredient('neutral_salt', [], { ...allCompatible, vegana: 'incompativel' }, true);
    const saltProduct = { ...products[0], ingredientId: neutralSalt.id, dietCompatibility: allCompatible };
    expect(validateProducts([saltProduct], [neutralSalt]).ok).toBe(true);
  });

  it('rejects duplicate IDs, enum errors, and missing references', () => {
    expect(validateIngredients([catalogue[0], catalogue[0]]).ok).toBe(false);
    expect(validateIngredients([{ ...catalogue[0], category: 'wrong' }]).ok).toBe(false);
    expect(validateIngredients([{ ...catalogue[0], allergens: ['walnuts'] }]).ok).toBe(false);
    expect(validateIngredients([{ ...catalogue[0], dietCompatibility: { ...allCompatible, extra: 'compativel' } }]).ok).toBe(false);
    expect(validateRecipes([{ ...recipes[0], ingredients: [{ ingredientId: 'missing', amount: 1, unit: 'g' }] }], catalogue).ok).toBe(false);
    expect(validateRecipes([{ ...recipes[0], imageUrl: '' }], catalogue).ok).toBe(false);
    expect(validateProducts([{ ...products[0], unit: 'wrong' }], catalogue).ok).toBe(false);
    expect(validateProducts([{ ...products[0], priceState: 'live' }], catalogue).ok).toBe(false);
    expect(validateProducts([{ ...products[0], ingredientId: 'missing' }], catalogue).ok).toBe(false);
    expect(validateProducts([{ ...products[0], packSize: 0 }], catalogue).ok).toBe(false);
    expect(validateProducts([products[0], products[0]], catalogue).ok).toBe(false);
  });

  it('requires valid conversions for recipe loose units and checks derived diet declarations', () => {
    const spice = syntheticIngredient('spice', []);
    const looseRecipe = syntheticRecipe('loose_recipe', spice, []);
    const line = { ingredientId: spice.id, amount: 1, unit: 'colher_sopa' as const };
    expect(validateRecipes([{ ...looseRecipe, ingredients: [line] }], [spice]).ok).toBe(false);
    const converted = { ...spice, unitConversions: { colher_sopa: 15 } };
    expect(validateRecipes([{ ...looseRecipe, ingredients: [line] }], [converted]).ok).toBe(true);
    const incompatible = syntheticIngredient('animal_product', [], { ...allCompatible, vegana: 'incompativel' });
    const inaccurate = syntheticRecipe('inaccurate_diet', incompatible, [], allCompatible);
    expect(validateRecipes([inaccurate], [incompatible]).ok).toBe(false);
    expect(validateRecipes([{ ...looseRecipe, ingredients: [{ ingredientId: spice.id, amount: 0, unit: 'g' }] }], [spice]).ok).toBe(false);
  });

  it('keeps at least seven product-available recipe choices per dietary rule and meal type', () => {
    const rules = ['vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'] as const;
    const mealTypes = ['pequeno_almoco', 'almoco', 'jantar', 'lanche'] as const;
    const profile = (dietaryRule: typeof rules[number], supermarketId: 'continente' | 'pingo_doce') => ({
      supermarketId, people: 2, mealTypes: [...mealTypes], dietaryRule, allergens: [], exclusionText: [],
      ownedIngredientIds: [], priority: 'mais_barato' as const, weeklyBudget: 50,
    });
    for (const rule of rules) for (const supermarket of ['continente', 'pingo_doce'] as const) for (const mealType of mealTypes) {
      const choices = recipes.filter((recipe) => recipe.mealTypes.includes(mealType)
        && recipe.declaredDietCompatibility[rule] === 'compativel'
        && recipe.ingredients.every((line) => safeProductsFor(line.ingredientId, profile(rule, supermarket), data).length > 0));
      expect(choices.length).toBeGreaterThanOrEqual(7);
    }
  });

  it('audits all seed recipes for practical quantities, individual preparation steps, and derived declarations', () => {
    const ingredientMap = new Map(catalogue.map((ingredient) => [ingredient.id, ingredient]));
    expect(recipes).toHaveLength(32);
    expect(new Set(recipes.map((recipe) => recipe.name)).size).toBe(recipes.length);
    for (const recipe of recipes) {
      expect(recipe.baseServings).toBe(2);
      expect(recipe.prepMinutes).toBeGreaterThanOrEqual(5);
      expect(recipe.prepMinutes).toBeLessThanOrEqual(780);
      expect(recipe.steps.length).toBeGreaterThanOrEqual(2);
      expect(recipe.steps.every((step) => step.trim().length > 12)).toBe(true);
      expect(new Set(recipe.steps).size).toBe(recipe.steps.length);
      for (const line of recipe.ingredients) {
        const perServing = line.amount / recipe.baseServings;
        if (line.unit === 'un') expect(perServing).toBeLessThanOrEqual(3);
        else expect(perServing).toBeLessThanOrEqual(350);
      }
      expect(recipe.declaredAllergens).toEqual(deriveRecipeAllergens(recipe, ingredientMap));
      expect(recipe.declaredDietCompatibility).toEqual(deriveRecipeDiet(recipe, ingredientMap));
    }
  });
});
