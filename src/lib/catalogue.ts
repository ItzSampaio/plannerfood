import ingredientsJson from '../data/ingredients.json';
import recipesJson from '../data/recipes.json';
import productsJson from '../data/products.json';
import type { Catalogue } from './types';

export const catalogue: Catalogue = {
  ingredients: ingredientsJson as Catalogue['ingredients'],
  recipes: recipesJson as Catalogue['recipes'],
  products: productsJson as Catalogue['products'],
};
