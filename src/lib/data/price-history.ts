import type { Product, PriceHistoryEntry } from '../types';

function sameEstimate(left: Product['estimate'], right: Product['estimate']): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function historyEntry(product: Product, id: string, recordedAt: string, note: string | null): PriceHistoryEntry {
  const entry: PriceHistoryEntry = {
    id,
    price: product.price,
    priceState: product.priceState,
    recordedAt,
    effectiveDate: product.priceUpdatedAt ?? product.estimate?.enteredAt.slice(0, 10) ?? null,
    sourceUrl: product.productUrl ?? null,
    note,
    ...(product.priceObservation ? { observation: structuredClone(product.priceObservation) } : {}),
  };
  if (product.estimate) entry.estimate = { ...product.estimate };
  return entry;
}

export function initialPriceHistory(product: Product, recordedAt: string, note: string | null = null): PriceHistoryEntry[] {
  return [historyEntry(product, `${product.id}-${recordedAt}-initial`, recordedAt, note)];
}

export function withPriceHistory(previous: Product, next: Product, recordedAt: string, note: string | null = null): Product {
  const changed = previous.priceState !== next.priceState
    || previous.price !== next.price
    || previous.priceUpdatedAt !== next.priceUpdatedAt
    || previous.productUrl !== next.productUrl
    || JSON.stringify(previous.priceObservation ?? null) !== JSON.stringify(next.priceObservation ?? null)
    || !sameEstimate(previous.estimate, next.estimate);
  if (!changed) return { ...next, priceHistory: previous.priceHistory };
  const history = [...(previous.priceHistory ?? [])];
  history.push(historyEntry(previous, `${previous.id}-${recordedAt}-before`, recordedAt, 'Valor anterior'));
  history.push(historyEntry(next, `${next.id}-${recordedAt}-after`, recordedAt, note));
  return { ...next, priceHistory: history };
}
