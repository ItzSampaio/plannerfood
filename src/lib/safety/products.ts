import { type AllergenInfo, type Catalogue, type Ingredient, type Product, type UserProfile } from '../types';
import { isAllergenInfoSafe } from './allergens';
import { isProductDietOk } from './diet';

export function isProductSafe(product: Product, ingredient: Ingredient, profile: UserProfile): boolean {
  return product.ingredientId === ingredient.id
    && product.availability !== 'unavailable'
    && isAllergenInfoSafe(ingredient.allergens, profile)
    && isAllergenInfoSafe(product.allergens, profile);
}

export function isProductOverrideSafe(product: Product, ingredient: Ingredient, profile: UserProfile): boolean {
  return product.supermarketId === profile.supermarketId
    && isProductSafe(product, ingredient, profile)
    && isProductDietOk(product, ingredient, profile.dietaryRule);
}

export function safeProductsFor(ingredientId: string, profile: UserProfile, catalogue: Catalogue): Product[] {
  const ingredient = catalogue.ingredients.find((entry) => entry.id === ingredientId);
  if (!ingredient) return [];
  return catalogue.products.filter((product) =>
    product.supermarketId === profile.supermarketId
    && isProductOverrideSafe(product, ingredient, profile));
}

export const isIngredientAvailable = (ingredientId: string, profile: UserProfile, catalogue: Catalogue): boolean =>
  safeProductsFor(ingredientId, profile, catalogue).length > 0;

export function unionAllergenInfo(left: AllergenInfo, right: AllergenInfo): AllergenInfo {
  if (left === 'unknown' || right === 'unknown') return 'unknown';
  return [...new Set([...left, ...right])].sort();
}
