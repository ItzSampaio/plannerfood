import type { Catalogue, IngredientNeed, Plan, QuantityWarning, Recipe } from '../types';
import { convertToBaseUnits } from './units';
import { scaleAmount } from './scale';

export function consolidateNeeds(plan: Plan, catalogue: Catalogue): IngredientNeed[] {
  const recipes = new Map(catalogue.recipes.map((recipe) => [recipe.id, recipe]));
  const needs = new Map<string, { quantity: number; warnings: QuantityWarning[] }>();
  for (const day of plan.days) for (const slot of day.slots) {
    const recipe: Recipe | undefined = recipes.get(slot.recipeId);
    if (!recipe) continue;
    for (const line of recipe.ingredients) {
      const ingredient = catalogue.ingredients.find((entry) => entry.id === line.ingredientId);
      if (!ingredient) continue;
      const current = needs.get(ingredient.id) ?? { quantity: 0, warnings: [] };
      const scaled = scaleAmount(line, plan.profile.people, recipe.baseServings);
      const converted = convertToBaseUnits(line, ingredient, scaled);
      if (converted.uncertain) current.warnings.push({ ingredientId: ingredient.id, recipeId: recipe.id, unit: line.unit as QuantityWarning['unit'] });
      else current.quantity += converted.quantity;
      needs.set(ingredient.id, current);
    }
  }
  return [...needs.entries()].map(([ingredientId, value]) => ({
    ingredientId, quantity: value.quantity, quantityUncertain: value.warnings.length > 0, warnings: value.warnings,
  })).sort((a, b) => a.ingredientId.localeCompare(b.ingredientId));
}
