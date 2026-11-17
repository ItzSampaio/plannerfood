import type { AllergenInfo, BaseUnit, Catalogue, DietCompatibility, SupermarketId } from '../types';

export type ObservationSource = 'scrapling' | 'cesta_mcp' | 'open_food_facts' | 'open_prices' | 'manual_import';
export type ObservationReviewStatus = 'pending' | 'approved' | 'rejected';
export type ObservationPackage = { size: number | null; unit: BaseUnit | null; text: string | null; fixed: boolean | null };
export type ObservationPrice = {
  amount: number | null;
  currency: string | null;
  unitAmount: number | null;
  unit: 'kg' | 'l' | 'un' | null;
  promotionalAmount: number | null;
  originalAmount: number | null;
};
export type RawObservation = {
  id: string;
  source: ObservationSource;
  retailer: SupermarketId | null;
  sourceProductId: string | null;
  ean: string | null;
  name: string | null;
  brand: string | null;
  package: ObservationPackage;
  price: ObservationPrice;
  sourceUrl: string | null;
  observedAt: string;
  raw: unknown;
  retrievalError: string | null;
  ingredients: string | null;
  allergens: AllergenInfo;
  nutrition: unknown;
  dietaryCompatibility: DietCompatibility | null;
  reviewStatus: ObservationReviewStatus;
};

export type ObservationMatch = {
  productId: string;
  kind: 'exact_ean' | 'name_candidate';
  score: number;
};

export function observationIsStale(observation: RawObservation, today: string): boolean {
  return observation.observedAt.slice(0, 10) < today;
}

export function suggestObservationMatches(observation: RawObservation, catalogue: Catalogue): ObservationMatch[] {
  const ean = observation.ean?.trim();
  if (ean) {
    const exact = catalogue.products.filter((product) => product.barcode === ean || product.barcodes?.includes(ean));
    if (exact.length) return exact.map((product) => ({ productId: product.id, kind: 'exact_ean', score: 1 }));
  }
  const name = normalise(observation.name ?? '');
  if (!name) return [];
  return catalogue.products
    .filter((product) => !observation.retailer || product.supermarketId === observation.retailer)
    .map((product) => ({ product, score: tokenScore(name, normalise(product.name)) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.product.id.localeCompare(right.product.id))
    .slice(0, 5)
    .map((item) => ({ productId: item.product.id, kind: 'name_candidate', score: item.score }));
}

function normalise(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function tokenScore(left: string, right: string): number {
  const a = new Set(left.split(' '));
  const b = new Set(right.split(' '));
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / Math.max(a.size, b.size, 1);
}

export function parseObservationImport(value: unknown): { ok: true; observations: RawObservation[] } | { ok: false; errors: string[] } {
  const input = Array.isArray(value) ? value : isRecord(value) && Array.isArray(value.observations) ? value.observations : null;
  if (!input) return { ok: false, errors: ['O ficheiro de observações deve conter um array de observações.'] };
  const errors: string[] = [];
  const observations: RawObservation[] = [];
  input.forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.source !== 'string' || typeof item.observedAt !== 'string') {
      errors.push(`Observação ${index + 1}: faltam id, source ou observedAt.`); return;
    }
    if (!['scrapling', 'cesta_mcp', 'open_food_facts', 'open_prices', 'manual_import'].includes(item.source)) { errors.push(`Observação ${index + 1}: source inválida.`); return; }
    const price = isRecord(item.price) ? item.price : {};
    const packageInfo = isRecord(item.package) ? item.package : {};
    observations.push({
      id: item.id,
      source: item.source as ObservationSource,
      retailer: item.retailer === 'continente' || item.retailer === 'pingo_doce' ? item.retailer : null,
      sourceProductId: stringOrNull(item.sourceProductId), ean: stringOrNull(item.ean), name: stringOrNull(item.name), brand: stringOrNull(item.brand),
      package: { size: numberOrNull(packageInfo.size), unit: baseUnitOrNull(packageInfo.unit), text: stringOrNull(packageInfo.text), fixed: typeof packageInfo.fixed === 'boolean' ? packageInfo.fixed : null },
      price: { amount: numberOrNull(price.amount), currency: stringOrNull(price.currency), unitAmount: numberOrNull(price.unitAmount), unit: priceUnitOrNull(price.unit), promotionalAmount: numberOrNull(price.promotionalAmount), originalAmount: numberOrNull(price.originalAmount) },
      sourceUrl: stringOrNull(item.sourceUrl), observedAt: item.observedAt, raw: item.raw ?? null, retrievalError: stringOrNull(item.retrievalError),
      ingredients: stringOrNull(item.ingredients), allergens: item.allergens === 'unknown' || Array.isArray(item.allergens) ? item.allergens as AllergenInfo : 'unknown', nutrition: item.nutrition ?? null,
      dietaryCompatibility: isRecord(item.dietaryCompatibility) ? item.dietaryCompatibility as DietCompatibility : null,
      reviewStatus: item.reviewStatus === 'rejected' || item.reviewStatus === 'approved' ? item.reviewStatus : 'pending',
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, observations };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringOrNull(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value : null; }
function numberOrNull(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function baseUnitOrNull(value: unknown): BaseUnit | null { return value === 'g' || value === 'ml' || value === 'un' ? value : null; }
function priceUnitOrNull(value: unknown): RawObservation['price']['unit'] { return value === 'kg' || value === 'l' || value === 'un' ? value : null; }
