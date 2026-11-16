import { DIET_TAGS, type DietCompatibility, type DietaryRule, type Ingredient, type Recipe, type UserProfile } from '../types';

export function deriveRecipeDiet(recipe: Recipe, ingredients: readonly Ingredient[] | ReadonlyMap<string, Ingredient>): DietCompatibility {
  const result: DietCompatibility = { vegetariana: 'compativel', vegana: 'compativel', sem_gluten: 'compativel', sem_lactose: 'compativel' };
  for (const line of recipe.ingredients) {
    const ingredient = 'get' in ingredients
      ? ingredients.get(line.ingredientId)
      : ingredients.find((entry) => entry.id === line.ingredientId);
    for (const tag of DIET_TAGS) {
      if (ingredient?.isNeutral) continue;
      const status = ingredient?.dietCompatibility[tag] ?? 'desconhecido';
      if (status === 'incompativel') result[tag] = 'incompativel';
      else if (status === 'desconhecido' && result[tag] !== 'incompativel') result[tag] = 'desconhecido';
    }
  }
  return result;
}

export const isDietOk = (status: string, rule: DietaryRule): boolean =>
  rule === 'nenhuma' || status === 'compativel';

export function isProductDietOk(product: { dietCompatibility: DietCompatibility }, ingredient: Ingredient, rule: DietaryRule): boolean {
  if (rule === 'nenhuma') return true;
  if (product.dietCompatibility[rule] !== 'compativel') return false;
  return ingredient.isNeutral || ingredient.dietCompatibility[rule] === 'compativel';
}

export const isIngredientDietOk = (ingredient: Ingredient, profile: UserProfile): boolean =>
  profile.dietaryRule === 'nenhuma' || ingredient.isNeutral || ingredient.dietCompatibility[profile.dietaryRule] === 'compativel';
