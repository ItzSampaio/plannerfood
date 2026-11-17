export const PLAN_STORAGE_KEY = 'smartbasket:plan:v1';

import { ALLERGENS, type Catalogue, type Plan, type UserProfile } from '../types';
import { validateRecipeForSlot } from '../engine/generate';
import { isProductSafe } from '../safety/products';
import { isProductDietOk } from '../safety/diet';

export function readSavedPlan(raw: string | null, activeCatalogue: Catalogue): Plan | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const plan = value as Partial<Plan>;
    if (typeof plan.id !== 'string' || !plan.id || typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt)) || !plan.profile || !Array.isArray(plan.days) || plan.days.length !== 7) return null;
    const profile = plan.profile;
    if ((profile.supermarketId !== 'continente' && profile.supermarketId !== 'pingo_doce')
      || !Number.isInteger(profile.people) || profile.people < 1 || profile.people > 12
      || !Array.isArray(profile.mealTypes) || profile.mealTypes.length === 0 || !profile.mealTypes.every((meal) => ['pequeno_almoco', 'almoco', 'jantar', 'lanche'].includes(meal))
      || !['nenhuma', 'vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'].includes(profile.dietaryRule)
      || !Array.isArray(profile.allergens) || !profile.allergens.every((allergen) => ALLERGENS.includes(allergen))
      || !Array.isArray(profile.exclusionText) || !profile.exclusionText.every((text) => typeof text === 'string')
      || !Array.isArray(profile.ownedIngredientIds) || !profile.ownedIngredientIds.every((id) => typeof id === 'string' && activeCatalogue.ingredients.some((ingredient) => ingredient.id === id))
      || !['mais_barato', 'saudavel', 'rapido', 'melhor_valor'].includes(profile.priority)
      || !Number.isFinite(profile.weeklyBudget) || profile.weeklyBudget < 10 || profile.weeklyBudget > 1000 || Math.round(profile.weeklyBudget * 100) !== profile.weeklyBudget * 100) return null;
    const repeats = new Map<string, number>();
    if (plan.days.some((day, index) => !day || day.day !== ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'][index] || !Array.isArray(day.slots) || day.slots.some((slot) => {
      if (typeof slot.recipeId !== 'string' || typeof slot.mealType !== 'string' || typeof slot.locked !== 'boolean') return true;
      const count = (repeats.get(slot.recipeId) ?? 0) + 1;
      repeats.set(slot.recipeId, count);
      return count > 2 || !profile.mealTypes.includes(slot.mealType) || !validateRecipeForSlot(slot.recipeId, slot.mealType, profile as UserProfile, activeCatalogue);
    }))) return null;
    if (typeof plan.productOverrides !== 'object' || plan.productOverrides === null || Array.isArray(plan.productOverrides) || typeof plan.purchased !== 'object' || plan.purchased === null || Array.isArray(plan.purchased)) return null;
    if (Object.values(plan.purchased).some((value) => typeof value !== 'boolean') || Object.values(plan.productOverrides).some((value) => typeof value !== 'string')) return null;
    for (const [ingredientId, productId] of Object.entries(plan.productOverrides)) {
      const ingredient = activeCatalogue.ingredients.find((item) => item.id === ingredientId);
      const product = activeCatalogue.products.find((item) => item.id === productId);
      if (!ingredient || !product || product.ingredientId !== ingredientId || product.supermarketId !== profile.supermarketId || !isProductSafe(product, ingredient, profile) || !isProductDietOk(product, ingredient, profile.dietaryRule)) return null;
    }
    return plan as Plan;
  } catch {
    return null;
  }
}
