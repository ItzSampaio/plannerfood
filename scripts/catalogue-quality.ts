import { readFileSync } from 'node:fs';

type Product = {
  supermarketId: string; catalogueSource?: string; priceState: string; barcode?: string | null; barcodes?: string[];
  packSize?: number; unit?: string; allergens: unknown; dietCompatibility?: Record<string, string>; ingredients?: string;
};

const products = JSON.parse(readFileSync('src/data/products.json', 'utf8')) as Product[];
const count = (predicate: (product: Product) => boolean): number => products.filter(predicate).length;
const perRetailer = (retailer: string): number => count((product) => product.supermarketId === retailer);
const hasEan = (product: Product): boolean => Boolean(product.barcode || product.barcodes?.some(Boolean));
const hasPackage = (product: Product): boolean => Number.isFinite(product.packSize) && Boolean(product.unit);
const completeAllergens = (product: Product): boolean => Array.isArray(product.allergens);
const completeDiet = (product: Product): boolean => Boolean(product.dietCompatibility && Object.values(product.dietCompatibility).every((value) => value !== 'desconhecido'));
const real = products.filter((product) => product.catalogueSource !== undefined && product.catalogueSource !== 'generic_seed');

console.log(`# Catalogue quality report\n\n- Total products: ${products.length}\n- Real/non-generic products: ${real.length}\n- Continente products: ${perRetailer('continente')}\n- Pingo Doce products: ${perRetailer('pingo_doce')}\n- Products with EAN/barcode: ${count(hasEan)}\n- Products with package information: ${count(hasPackage)}\n- Products with ingredients: ${count((product) => Boolean(product.ingredients))}\n- Products with complete allergen lists: ${count(completeAllergens)}\n- Products with complete dietary compatibility: ${count(completeDiet)}\n- Manual prices: ${count((product) => product.priceState === 'manual')}\n- Observed prices: ${count((product) => product.priceState === 'observado')}\n- Verified prices: ${count((product) => product.priceState === 'verificado')}\n- Unknown prices: ${count((product) => product.priceState === 'desconhecido')}\n- Estimated prices: ${count((product) => product.priceState === 'estimativa')}\n\n## Interpretation\n\nThe seed catalogue remains generic. The non-generic records are prior observed rice records; they retain provenance and unknown safety fields where evidence is missing. The current Scrapling Continente observations are kept as raw observations, not catalogue products, because fixed package information and safety evidence are unavailable. Pingo Doce is not being expanded in this phase.\n`);
