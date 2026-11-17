import type { Catalogue, Product } from '../types';
import { validateCatalogue } from './validators';
import { type RawObservation } from './observations';

export type ApprovalAction = 'existing_product' | 'new_product';
export type ObservationReview = {
  action: ApprovalAction;
  targetProductId?: string;
  ingredientId: string;
  packageSize: number | null;
  packageUnit: Product['unit'] | null;
  confirmIdentity: boolean;
  confirmPackage: boolean;
  confirmAllergens: boolean;
  confirmDiet: boolean;
  fields: Array<'name' | 'brand' | 'barcode' | 'package' | 'price' | 'source'>;
  approvedAt: string;
};

export type ObservationAudit = {
  observationId: string;
  action: ApprovalAction;
  productId: string;
  approvedAt: string;
  changedFields: string[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

export type ApprovalResult = { ok: true; catalogue: Catalogue; audit: ObservationAudit } | { ok: false; errors: string[] };

export function approveObservation(catalogue: Catalogue, observation: RawObservation, review: ObservationReview): ApprovalResult {
  const errors: string[] = [];
  if (observation.reviewStatus !== 'pending') errors.push('A observação já não está pendente.');
  if (!review.confirmIdentity || !review.confirmPackage || !review.confirmAllergens || !review.confirmDiet) errors.push('É necessário confirmar identidade, embalagem, alergénios e dieta.');
  if (!review.ingredientId.trim()) errors.push('É necessário associar um ingrediente.');
  if (!review.packageSize || review.packageSize <= 0 || !review.packageUnit) errors.push('É necessário confirmar o tamanho e a unidade da embalagem.');
  if (observation.retailer && review.action === 'existing_product') {
    const target = catalogue.products.find((product) => product.id === review.targetProductId);
    if (target && target.supermarketId !== observation.retailer) errors.push('O retalhista da observação não corresponde ao produto selecionado.');
  }
  if (observation.price.amount !== null && (!Number.isFinite(observation.price.amount) || observation.price.amount < 0 || Math.round(observation.price.amount * 100) !== observation.price.amount * 100)) errors.push('O preço observado é inválido.');
  if (errors.length) return { ok: false, errors };

  const target = review.action === 'existing_product' ? catalogue.products.find((product) => product.id === review.targetProductId) : undefined;
  if (review.action === 'existing_product' && !target) return { ok: false, errors: ['O produto existente selecionado não foi encontrado.'] };
  const productId = target?.id ?? `observation-${observation.source}-${observation.sourceProductId ?? observation.id}`;
  const base: Product = target ?? {
    id: productId, name: observation.name ?? 'Produto sem nome', supermarketId: observation.retailer ?? 'continente', ingredientId: review.ingredientId,
    packSize: review.packageSize ?? 1, unit: review.packageUnit ?? 'un', price: null, priceState: 'desconhecido', priceUpdatedAt: null,
    allergens: 'unknown', dietCompatibility: { vegetariana: 'desconhecido', vegana: 'desconhecido', sem_gluten: 'desconhecido', sem_lactose: 'desconhecido' },
  };
  const next: Product = { ...base, ingredientId: review.ingredientId, packSize: review.packageSize ?? base.packSize, unit: review.packageUnit ?? base.unit, catalogueSource: 'user' };
  if (review.fields.includes('name') && observation.name) next.name = observation.name;
  if (review.fields.includes('brand') && observation.brand) next.brand = observation.brand;
  if (review.fields.includes('barcode') && observation.ean) next.barcode = observation.ean;
  if (review.fields.includes('source')) { next.productUrl = observation.sourceUrl; next.externalProductId = observation.sourceProductId; }
  if (review.fields.includes('price') && observation.source !== 'open_food_facts' && observation.price.amount !== null && observation.price.currency === 'EUR') {
    next.price = observation.price.amount; next.priceState = 'observado'; next.priceUpdatedAt = observation.observedAt.slice(0, 10);
    next.priceObservation = observation.source === 'scrapling' ? { provider: 'scrapling', sourceProductId: observation.sourceProductId ?? observation.id, checkedAt: observation.observedAt, checkedDate: observation.observedAt.slice(0, 10), currency: 'EUR', availability: 'available' } : undefined;
  }
  const before = target ? snapshot(target) : {};
  const after = snapshot(next);
  const changedFields = Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const products = target ? catalogue.products.map((product) => product.id === target.id ? next : product) : [...catalogue.products, next];
  const resultCatalogue = { ...catalogue, products };
  const validation = validateCatalogue(resultCatalogue);
  if (!validation.ok) return { ok: false, errors: validation.errors.map((error) => `${error.path}: ${error.message}`) };
  return { ok: true, catalogue: resultCatalogue, audit: { observationId: observation.id, action: review.action, productId, approvedAt: review.approvedAt, changedFields, before, after } };
}

function snapshot(product: Product): Record<string, unknown> { return { name: product.name, brand: product.brand ?? null, barcode: product.barcode ?? null, ingredientId: product.ingredientId, packSize: product.packSize, unit: product.unit, price: product.price, priceState: product.priceState, priceUpdatedAt: product.priceUpdatedAt, productUrl: product.productUrl ?? null, externalProductId: product.externalProductId ?? null, allergens: product.allergens, dietCompatibility: product.dietCompatibility }; }
