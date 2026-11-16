import type { Catalogue, Product, PriceHistoryEntry, PriceState } from '../types';
import { validateCatalogue } from './validators';

export const PRODUCT_CATALOGUE_STORAGE_KEY = 'smartbasket:product-catalogue:v1';
export type ProductImportResult = { ok: true; catalogue: Catalogue } | { ok: false; errors: string[] };
const DIET_TAGS = ['vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'] as const;
const CSV_COLUMNS = [
  'id', 'supermarketId', 'ingredientId', 'name', 'brand', 'packSize', 'unit', 'priceState', 'price',
  'priceUpdatedAt', 'estimate', 'allergens', 'dietCompatibility', 'productUrl', 'barcode', 'barcodes', 'imageUrl',
  'imageSourceUrl', 'externalProductId', 'availability', 'unitPrice', 'priceObservation', 'catalogueSource', 'promo', 'priceHistory',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'produto';
}

function parseJsonCell(value: string, field: string): unknown {
  if (!value.trim()) return undefined;
  try { return JSON.parse(value) as unknown; } catch { throw new Error(`CSV field ${field} must contain valid JSON.`); }
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? '';
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"' && cell.length === 0) quoted = true;
    else if (character === ',') { row.push(cell); cell = ''; }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((part) => part.length > 0)) rows.push(row);
      row = [];
    } else cell += character;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(cell);
  if (row.some((part) => part.length > 0)) rows.push(row);
  return rows;
}

function parseProductObject(value: unknown, index: number, confirmedVerified: boolean): Product {
  if (!isRecord(value)) throw new Error(`Product row ${index + 1} must be an object.`);
  const state = value.priceState;
  if (!['manual', 'verificado', 'observado', 'estimativa', 'desconhecido'].includes(String(state))) throw new Error(`Product row ${index + 1} has an unknown price state.`);
  if (state === 'verificado' && !confirmedVerified) throw new Error('The import contains verified prices. Confirm that you checked those prices before importing.');
  const supermarketId = value.supermarketId;
  const ingredientId = value.ingredientId;
  const name = value.name;
  if (typeof supermarketId !== 'string' || !['continente', 'pingo_doce'].includes(supermarketId)) throw new Error(`Product row ${index + 1} has an unknown supermarket.`);
  if (typeof ingredientId !== 'string' || !ingredientId.trim()) throw new Error(`Product row ${index + 1} requires an ingredient match.`);
  if (typeof name !== 'string' || !name.trim()) throw new Error(`Product row ${index + 1} requires a product name.`);
  const packSize = typeof value.packSize === 'number' ? value.packSize : Number(value.packSize);
  const unit = value.unit;
  if (!Number.isFinite(packSize) || packSize <= 0 || !['g', 'ml', 'un'].includes(String(unit))) throw new Error(`Product row ${index + 1} requires a positive pack size and valid unit.`);
  const productId = typeof value.id === 'string' && value.id.trim()
    ? value.id.trim()
    : `user-${slug(supermarketId)}-${slug(ingredientId)}-${slug(name)}-${index + 1}`;
  const priceState = state as PriceState;
  let price: number | null = null;
  if (priceState === 'manual' || priceState === 'verificado' || priceState === 'observado') {
    if (typeof value.price === 'number') price = value.price;
    else if (typeof value.price === 'string' && value.price.trim() !== '') price = Number(value.price.replace(',', '.'));
    else throw new Error(`Product row ${index + 1} requires an explicit price for its selected price state.`);
    if (!Number.isFinite(price)) throw new Error(`Product row ${index + 1} requires a numeric price for its selected price state.`);
  }
  const estimate = isRecord(value.estimate) ? value.estimate : undefined;
  if (priceState === 'estimativa' && !estimate) throw new Error(`Product row ${index + 1} requires an estimate object.`);
  const allergens = value.allergens === 'unknown' || Array.isArray(value.allergens) ? value.allergens : 'unknown';
  const rawDiet = isRecord(value.dietCompatibility) ? value.dietCompatibility : {};
  const dietCompatibility = Object.fromEntries(DIET_TAGS.map((tag) => [tag, rawDiet[tag] ?? 'desconhecido']));
  const product: Product = {
    id: productId,
    name: name.trim(),
    supermarketId: supermarketId as Product['supermarketId'],
    ingredientId,
    packSize,
    unit: unit as Product['unit'],
    price,
    priceState,
    priceUpdatedAt: typeof value.priceUpdatedAt === 'string' ? value.priceUpdatedAt : null,
    allergens: allergens as Product['allergens'],
    dietCompatibility: dietCompatibility as Product['dietCompatibility'],
    brand: typeof value.brand === 'string' && value.brand.trim() ? value.brand.trim() : null,
    productUrl: typeof value.productUrl === 'string' && value.productUrl.trim() ? value.productUrl.trim() : null,
    barcode: typeof value.barcode === 'string' && value.barcode.trim() ? value.barcode.trim() : null,
    catalogueSource: value.catalogueSource === 'open_prices' || value.catalogueSource === 'generic_seed' || value.catalogueSource === 'cesta_mcp' ? value.catalogueSource : 'user',
  };
  if (estimate) product.estimate = estimate as Product['estimate'];
  if (isRecord(value.promo)) product.promo = value.promo as Product['promo'];
  if (Array.isArray(value.priceHistory)) product.priceHistory = value.priceHistory as PriceHistoryEntry[];
  if (Array.isArray(value.barcodes)) product.barcodes = value.barcodes.filter((item): item is string => typeof item === 'string');
  if (typeof value.imageUrl === 'string' || value.imageUrl === null) product.imageUrl = value.imageUrl;
  if (typeof value.imageSourceUrl === 'string' || value.imageSourceUrl === null) product.imageSourceUrl = value.imageSourceUrl;
  if (typeof value.externalProductId === 'string' || value.externalProductId === null) product.externalProductId = value.externalProductId;
  if (value.availability === 'available' || value.availability === 'unavailable') product.availability = value.availability;
  if (isRecord(value.unitPrice)) product.unitPrice = value.unitPrice as Product['unitPrice'];
  if (isRecord(value.priceObservation)) product.priceObservation = value.priceObservation as Product['priceObservation'];
  return product;
}

function parseCsv(text: string, confirmedVerified: boolean): Product[] {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ''));
  const headers = rows.shift()?.map((header) => header.trim()) ?? [];
  if (headers.length === 0 || !headers.includes('name') || !headers.includes('ingredientId')) throw new Error('CSV must have a header row containing name and ingredientId.');
  const result = rows.map((cells, index) => {
    const record: Record<string, unknown> = Object.fromEntries(headers.map((header, column) => [header, cells[column] ?? '']));
    for (const field of ['estimate', 'allergens', 'dietCompatibility', 'promo', 'priceHistory', 'barcodes', 'unitPrice', 'priceObservation']) {
      const value = record[field];
      if (typeof value === 'string' && value !== '') record[field] = parseJsonCell(value, field);
    }
    for (const field of ['packSize', 'price']) {
      const value = record[field];
      if (typeof value === 'string' && value.trim()) record[field] = Number(value.replace(',', '.'));
      else if (field === 'price') record[field] = null;
    }
    for (const field of ['brand', 'productUrl', 'barcode', 'priceUpdatedAt', 'imageUrl', 'imageSourceUrl', 'externalProductId']) if (record[field] === '') record[field] = null;
    return parseProductObject(record, index, confirmedVerified);
  });
  return result;
}

export function parseProductImport(text: string, format: 'json' | 'csv', base: Catalogue, confirmedVerified: boolean): ProductImportResult {
  try {
    let incoming: unknown;
    if (format === 'json') {
      incoming = JSON.parse(text) as unknown;
      if (isRecord(incoming) && incoming.version === 1) incoming = incoming.products;
      if (!Array.isArray(incoming)) throw new Error('JSON import must be a product array or a version 1 product export.');
    } else incoming = parseCsv(text, confirmedVerified);
    const products = (incoming as unknown[]).map((product, index) => parseProductObject(product, index, confirmedVerified));
    const byId = new Map(base.products.map((product) => [product.id, product]));
    const importedIds = new Set<string>();
    for (const product of products) {
      if (importedIds.has(product.id)) throw new Error(`Import contains duplicate product ID: ${product.id}.`);
      importedIds.add(product.id);
      const previous = byId.get(product.id);
      if (previous?.priceHistory?.length && !product.priceHistory?.length) product.priceHistory = previous.priceHistory;
      if (product.catalogueSource !== 'open_prices' && product.catalogueSource !== 'generic_seed') product.catalogueSource = 'user';
      byId.set(product.id, product);
    }
    const catalogue: Catalogue = { ...base, products: [...byId.values()] };
    const validation = validateCatalogue(catalogue);
    if (!validation.ok) return { ok: false, errors: validation.errors.map((error) => `${error.path}: ${error.message}`) };
    return { ok: true, catalogue };
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : 'Could not read the product file.'] };
  }
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function exportProductsCsv(products: readonly Product[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const product of products) {
    const values: Record<(typeof CSV_COLUMNS)[number], string> = {
      id: product.id,
      supermarketId: product.supermarketId,
      ingredientId: product.ingredientId,
      name: product.name,
      brand: product.brand ?? '',
      packSize: String(product.packSize),
      unit: product.unit,
      priceState: product.priceState,
      price: product.price === null ? '' : String(product.price),
      priceUpdatedAt: product.priceUpdatedAt ?? '',
      estimate: product.estimate ? JSON.stringify(product.estimate) : '',
      allergens: JSON.stringify(product.allergens),
      dietCompatibility: JSON.stringify(product.dietCompatibility),
      productUrl: product.productUrl ?? '',
      barcode: product.barcode ?? '',
      barcodes: product.barcodes ? JSON.stringify(product.barcodes) : '',
      imageUrl: product.imageUrl ?? '',
      imageSourceUrl: product.imageSourceUrl ?? '',
      externalProductId: product.externalProductId ?? '',
      availability: product.availability ?? '',
      unitPrice: product.unitPrice ? JSON.stringify(product.unitPrice) : '',
      priceObservation: product.priceObservation ? JSON.stringify(product.priceObservation) : '',
      catalogueSource: product.catalogueSource ?? 'generic_seed',
      promo: product.promo ? JSON.stringify(product.promo) : '',
      priceHistory: product.priceHistory ? JSON.stringify(product.priceHistory) : '',
    };
    lines.push(CSV_COLUMNS.map((column) => escapeCsv(values[column])).join(','));
  }
  return lines.join('\r\n');
}

export function exportProductsJson(products: readonly Product[]): string {
  return JSON.stringify({ version: 1, products }, null, 2);
}

export function readSavedCatalogue(raw: string | null, base: Catalogue): Catalogue | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.products)) return null;
    const imported = parseProductImport(JSON.stringify(value.products), 'json', base, true);
    return imported.ok ? imported.catalogue : null;
  } catch {
    return null;
  }
}

export function serializeSavedCatalogue(products: readonly Product[]): string {
  return exportProductsJson(products);
}
