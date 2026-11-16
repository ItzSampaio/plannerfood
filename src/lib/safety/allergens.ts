import { type Allergen, type AllergenInfo, type Ingredient, type Recipe, type UserProfile } from '../types';

export const hasDeclaredAllergy = (profile: UserProfile): boolean => profile.allergens.length > 0;

export function isAllergenInfoSafe(info: AllergenInfo, profile: UserProfile): boolean {
  if (!hasDeclaredAllergy(profile)) return true;
  if (info === 'unknown') return false;
  const declared = new Set<Allergen>(profile.allergens);
  return info.every((allergen) => !declared.has(allergen));
}

export const isIngredientSafe = (ingredient: Ingredient, profile: UserProfile): boolean =>
  isAllergenInfoSafe(ingredient.allergens, profile);

function ingredientById(ingredients: readonly Ingredient[] | ReadonlyMap<string, Ingredient>, id: string): Ingredient | undefined {
  return 'get' in ingredients ? ingredients.get(id) : ingredients.find((ingredient) => ingredient.id === id);
}

export function deriveRecipeAllergens(recipe: Recipe, ingredients: readonly Ingredient[] | ReadonlyMap<string, Ingredient>): AllergenInfo {
  const result = new Set<Allergen>();
  for (const line of recipe.ingredients) {
    const ingredient = ingredientById(ingredients, line.ingredientId);
    if (!ingredient || ingredient.allergens === 'unknown') return 'unknown';
    for (const allergen of ingredient.allergens) result.add(allergen);
  }
  return [...result].sort();
}

export function isRecipeAllergenSafe(recipe: Recipe, ingredients: readonly Ingredient[] | ReadonlyMap<string, Ingredient>, profile: UserProfile): boolean {
  return isAllergenInfoSafe(deriveRecipeAllergens(recipe, ingredients), profile)
    && isAllergenInfoSafe(recipe.declaredAllergens, profile);
}
