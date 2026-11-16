import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateCatalogue } from '../src/lib/data/validators';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), 'utf8')) as unknown;
}

const result = validateCatalogue({
  ingredients: readJson('src/data/ingredients.json'),
  recipes: readJson('src/data/recipes.json'),
  products: readJson('src/data/products.json'),
});

if (!result.ok) {
  for (const error of result.errors) process.stderr.write(`${error.path} [${error.code}]: ${error.message}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Catalogue valid: ingredients, recipes, products, references, and seed coverage.\n');
}
