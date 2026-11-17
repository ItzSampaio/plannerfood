import type { Product, PriceHistoryEntry } from '../types';

export type ProductAuditEvent = {
  id: string;
  kind: 'product_created' | 'product_updated' | 'observation_rejected';
  recordedAt: string;
  source: string;
  productId: string | null;
  observationId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

export function productAuditSnapshot(product: Record<string, unknown>): Record<string, unknown> {
  return {
    name: product.name, brand: product.brand ?? null, ingredientId: product.ingredientId, supermarketId: product.supermarketId,
    packSize: product.packSize, unit: product.unit, sellingModel: product.sellingModel ?? 'fixed_package',
    price: product.price, priceState: product.priceState, priceUpdatedAt: product.priceUpdatedAt,
    allergens: product.allergens, dietCompatibility: product.dietCompatibility, barcode: product.barcode ?? null,
  };
}

export function productAuditEvents(previous: readonly Record<string, unknown>[], next: readonly Record<string, unknown>[], recordedAt: string, source: string): ProductAuditEvent[] {
  const oldById = new Map(previous.filter((item) => typeof item.id === 'string').map((item) => [String(item.id), item]));
  const events: ProductAuditEvent[] = [];
  for (const product of next) {
    if (typeof product.id !== 'string') continue;
    const before = oldById.get(product.id);
    const beforeSnapshot = before ? productAuditSnapshot(before) : null;
    const afterSnapshot = productAuditSnapshot(product);
    if (beforeSnapshot && JSON.stringify(beforeSnapshot) === JSON.stringify(afterSnapshot)) continue;
    events.push({
      id: `${product.id}:${recordedAt}:${events.length}`,
      kind: before ? 'product_updated' : 'product_created', recordedAt, source,
      productId: product.id, observationId: null, before: beforeSnapshot, after: afterSnapshot,
    });
  }
  return events;
}

export function observationRejectedEvent(observation: { id: string; source: string }, recordedAt: string): ProductAuditEvent {
  return { id: `${observation.id}:${recordedAt}:rejected`, kind: 'observation_rejected', recordedAt, source: observation.source, productId: null, observationId: observation.id, before: { reviewStatus: 'pending' }, after: { reviewStatus: 'rejected' } };
}

export function groupPriceHistory(product: Product): Array<{ id: string; recordedAt: string; source: string; before: PriceHistoryEntry | null; after: PriceHistoryEntry | null }> {
  const groups = new Map<string, PriceHistoryEntry[]>();
  for (const entry of product.priceHistory ?? []) groups.set(entry.recordedAt, [...(groups.get(entry.recordedAt) ?? []), entry]);
  return [...groups].map(([recordedAt, entries]) => ({
    id: `${product.id}:${recordedAt}`,
    recordedAt,
    source: entries.find((entry) => entry.note !== 'Valor anterior')?.sourceUrl ?? entries[0]?.sourceUrl ?? 'Origem indisponível',
    before: entries.find((entry) => entry.note === 'Valor anterior') ?? null,
    after: entries.find((entry) => entry.note !== 'Valor anterior') ?? entries[0] ?? null,
  }));
}
