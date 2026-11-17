import { readFileSync } from 'node:fs';

type Product = { ingredientId: string; supermarketId: string; catalogueSource?: string; priceState: string; allergens: unknown; dietCompatibility: Record<string, string> };
type Recipe = { ingredients: Array<{ ingredientId: string }> };
const products = JSON.parse(readFileSync('src/data/products.json', 'utf8')) as Product[];
const recipes = JSON.parse(readFileSync('src/data/recipes.json', 'utf8')) as Recipe[];
const ingredientIds = [...new Set(recipes.flatMap((recipe) => recipe.ingredients.map((line) => line.ingredientId)))].sort();
const real = (id: string, retailer: string) => products.some((product) => product.ingredientId === id && product.supermarketId === retailer && product.catalogueSource !== undefined && product.catalogueSource !== 'generic_seed');
const generic = (id: string, retailer: string) => products.some((product) => product.ingredientId === id && product.supermarketId === retailer && (product.catalogueSource === undefined || product.catalogueSource === 'generic_seed'));
console.log('# Catalogue coverage report\n');
console.log(`- Recipe ingredients covered: ${ingredientIds.length}`);
for (const retailer of ['continente', 'pingo_doce']) {
  console.log(`- ${retailer}: real=${ingredientIds.filter((id) => real(id, retailer)).length}, generic-only=${ingredientIds.filter((id) => !real(id, retailer) && generic(id, retailer)).length}, missing=${ingredientIds.filter((id) => !real(id, retailer) && !generic(id, retailer)).length}`);
}
console.log('\n## Ingredient coverage\n');
console.log(ingredientIds.map((id) => `- ${id}: Continente=${real(id, 'continente') ? 'real' : generic(id, 'continente') ? 'genérico' : 'em falta'}; Pingo Doce=${real(id, 'pingo_doce') ? 'real' : generic(id, 'pingo_doce') ? 'genérico' : 'em falta'}`).join('\n'));
