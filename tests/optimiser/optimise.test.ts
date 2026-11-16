import { describe, expect, it } from 'vitest';
import { optimisePlan } from '../../src/lib/optimiser/optimise';
import type { Ingredient } from '../../src/lib/types';
import { engineCatalogue, enginePlan, engineRecipe } from '../fixtures/FAKE_engine';
import { fakeEstimatedPrice } from '../fixtures/FAKE_prices';

describe('plan optimiser', () => {
  it('chooses the largest safe whole-basket recipe saving and reports the final status', () => {
    const catalogue = engineCatalogue([
      engineRecipe('expensive', { ingredients: [{ ingredientId: 'rice', amount: 2500, unit: 'g' }] }),
      engineRecipe('cheaper', { ingredients: [{ ingredientId: 'rice', amount: 100, unit: 'g' }] }),
      engineRecipe('middle', { ingredients: [{ ingredientId: 'rice', amount: 1500, unit: 'g' }] }),
    ]);
    const plan = enginePlan(catalogue, { weeklyBudget: 1.5 });
    const result = optimisePlan(plan, catalogue, '2026-11-16');
    expect(result.before.estimatedTotalCents).toBe(300);
    expect(result.after.estimatedTotalCents).toBe(100);
    expect(result.actions).toEqual([{ kind: 'recipe', day: 'segunda', mealType: 'almoco', fromRecipeId: 'expensive', toRecipeId: 'cheaper', savingCents: 200 }]);
    expect(result.outcome).toBe('dentro');
    expect(result.stepsUsed).toBe(1);
  });

  it('does not change locked slots or explicit product overrides', () => {
    const catalogue = engineCatalogue([engineRecipe('only', { ingredients: [{ ingredientId: 'rice', amount: 2500, unit: 'g' }] })]);
    const plan = enginePlan(catalogue, { weeklyBudget: 1 });
    plan.days[0]!.slots[0]!.locked = true;
    plan.productOverrides.rice = 'rice-product';
    const result = optimisePlan(plan, catalogue, '2026-11-16');
    expect(result.plan.days[0]?.slots[0]).toEqual(plan.days[0]?.slots[0]);
    expect(result.plan.productOverrides).toEqual(plan.productOverrides);
    expect(result.actions).toEqual([]);
    expect(result.outcome).toBe('excede');
    expect(result.topCostDrivers).toMatchObject([{ ingredientId: 'rice', userOverride: true, checkoutCents: 300 }]);
  });

  it('does not trade a known product for a cheaper estimate', () => {
    const catalogue = engineCatalogue([engineRecipe('only', { ingredients: [{ ingredientId: 'rice', amount: 2500, unit: 'g' }] })]);
    const baseProduct = catalogue.products[0];
    if (baseProduct) catalogue.products.push(fakeEstimatedPrice({ ...baseProduct, id: 'rice-estimate' }, { value: 0.1, low: 0.05, high: 0.2, enteredAt: '2026-11-16' }));
    const plan = enginePlan(catalogue, { weeklyBudget: 1 });
    const result = optimisePlan(plan, catalogue, '2026-11-16');
    expect(result.actions).toEqual([]);
    expect(result.after.hasEstimate).toBe(false);
    expect(result.after.estimatedTotalCents).toBe(300);
  });

  it('does not introduce allergen-unsafe recipe alternatives', () => {
    const catalogue = engineCatalogue([
      engineRecipe('safe'),
      engineRecipe('fishy', { ingredients: [{ ingredientId: 'fish', amount: 100, unit: 'g' }], declaredAllergens: ['peixe'] }),
    ]);
    const fish: Ingredient = { ...catalogue.ingredients[0]!, id: 'fish', name: 'Peixe', allergens: ['peixe'] };
    catalogue.ingredients.push(fish);
    const product = catalogue.products[0];
    if (product) catalogue.products.push({ ...product, id: 'fish-product', ingredientId: 'fish', allergens: ['peixe'] });
    const plan = enginePlan(catalogue, { allergens: ['peixe'], weeklyBudget: 0.5 });
    plan.days[0]!.slots[0]!.recipeId = 'safe';
    const result = optimisePlan(plan, catalogue, '2026-11-16');
    expect(result.plan.days.flatMap((day) => day.slots.map((slot) => slot.recipeId))).not.toContain('fishy');
    expect(result.actions.some((action) => action.kind === 'recipe' && action.toRecipeId === 'fishy')).toBe(false);
  });
});
