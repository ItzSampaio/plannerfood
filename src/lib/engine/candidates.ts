import type { Catalogue, DietaryRule, MealType, Recipe, UserProfile } from '../types';
import { deriveRecipeAllergens, isRecipeAllergenSafe } from '../safety/allergens';
import { deriveRecipeDiet, isDietOk } from '../safety/diet';
import { isIngredientAvailable } from '../safety/products';
import { normalizeText } from '../text';
import type { CandidateEvaluation, ExclusionReason } from './types';

export function evaluateRecipe(recipe: Recipe, mealType: MealType, profile: UserProfile, catalogue: Catalogue): CandidateEvaluation {
  const reasons: ExclusionReason[] = [];
  const ingredients = new Map(catalogue.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  if (!recipe.mealTypes.includes(mealType)) reasons.push('tipo_refeicao');
  const derivedAllergens = deriveRecipeAllergens(recipe, ingredients);
  if (derivedAllergens === 'unknown' || !isRecipeAllergenSafe(recipe, ingredients, profile)) reasons.push('alergenio');
  const diet = deriveRecipeDiet(recipe, ingredients);
  if (!isDietOk(diet[profile.dietaryRule as Exclude<DietaryRule, 'nenhuma'>] ?? 'compativel', profile.dietaryRule)) reasons.push('dieta');
  if (recipe.ingredients.some((line) => !ingredients.has(line.ingredientId) || !isIngredientAvailable(line.ingredientId, profile, catalogue))) {
    reasons.push('produto_indisponivel');
  }
  const exclusions = profile.exclusionText.map(normalizeText).filter(Boolean);
  if (exclusions.length > 0) {
    const haystack = [recipe.name, ...recipe.ingredients.map((line) => ingredients.get(line.ingredientId)?.name ?? '')].map(normalizeText);
    if (exclusions.some((term) => haystack.some((text) => text.includes(term)))) reasons.push('exclusao_texto');
  }
  return { recipe, eligible: reasons.length === 0, reasons: [...new Set(reasons)] };
}

export function buildCandidates(mealType: MealType, profile: UserProfile, catalogue: Catalogue): CandidateEvaluation[] {
  return catalogue.recipes.map((recipe) => evaluateRecipe(recipe, mealType, profile, catalogue));
}
