import { performance } from 'node:perf_hooks';
import ingredients from '../src/data/ingredients.json';
import products from '../src/data/products.json';
import recipes from '../src/data/recipes.json';
import { generateWeek } from '../src/lib/engine/generate';
import type { Catalogue, UserProfile } from '../src/lib/types';

const catalogue = { ingredients, products, recipes } as unknown as Catalogue;
const profile: UserProfile = {
  supermarketId: 'continente', people: 2,
  mealTypes: ['pequeno_almoco', 'almoco', 'jantar', 'lanche'],
  dietaryRule: 'nenhuma', allergens: [], exclusionText: [], ownedIngredientIds: [],
  priority: 'mais_barato', weeklyBudget: 100,
};
const stressCatalogue = {
  ...catalogue,
  recipes: Array.from({ length: 4 }, (_, copy) => recipes.map((recipe) => ({ ...recipe, id: `stress_${copy}_${recipe.id}` }))).flat(),
} as unknown as Catalogue;

for (const [label, data] of [['realistic', catalogue], ['stress', stressCatalogue]] as const) {
  const started = performance.now();
  const result = generateWeek(profile, data, '2026-11-16', 1729);
  const elapsedMs = performance.now() - started;
  console.log(`${label}: ${result.ok ? 'success' : `failure (${result.reason})`}; nodes=${result.nodesUsed}; elapsedMs=${elapsedMs.toFixed(2)}`);
}
