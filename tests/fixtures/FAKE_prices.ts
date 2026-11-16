import type { Product } from '../../src/lib/types';

export const FAKE_PRICE_UPDATED_AT = '2026-11-16';
export const FAKE_BASE_PRICE = 1.25;
export const FAKE_PRICE_ZERO = 0;
export const FAKE_PRICE_THREE_DECIMALS = 1.234;
const FAKE_SUBCENT = 0.001;
export const FAKE_ESTIMATE_VALUE = 1;
export const FAKE_ESTIMATE_LOW = 0.8;
export const FAKE_ESTIMATE_HIGH = 1.2;
export const FAKE_ESTIMATE_INVERTED_LOW = 1.3;
export const FAKE_ESTIMATE_INVERTED_HIGH = 1.1;
export const FAKE_ESTIMATE_ENTERED_AT = '2026-11-16';
export const FAKE_PROMO_PRICE = 1;
export const FAKE_PROMO_VALID_UNTIL = '2026-12-01';
export const FAKE_INVALID_DATE = '2026-02-30';

export function fakeManualPrice(product: Product, price: number): Product {
  return { ...product, price, priceState: 'manual', priceUpdatedAt: FAKE_PRICE_UPDATED_AT };
}

export function fakeVerifiedPrice(product: Product, price = FAKE_BASE_PRICE): Product {
  return { ...fakeManualPrice(product, price), priceState: 'verificado' };
}

export function fakeVerifiedWithoutDate(product: Product): Product {
  return { ...fakeVerifiedPrice(product), priceUpdatedAt: null };
}

export function fakeManualWithPromo(product: Product): Product {
  return { ...fakeManualPrice(product, FAKE_BASE_PRICE), promo: { price: FAKE_PROMO_PRICE, validUntil: FAKE_PROMO_VALID_UNTIL } };
}

export function fakeManualWithInvalidPromo(product: Product): Product {
  return { ...fakeManualPrice(product, FAKE_BASE_PRICE), promo: { price: FAKE_BASE_PRICE, validUntil: FAKE_PROMO_VALID_UNTIL } };
}

export function fakeManualWithInvalidPromoDate(product: Product): Product {
  return { ...fakeManualPrice(product, FAKE_BASE_PRICE), promo: { price: FAKE_PROMO_PRICE, validUntil: FAKE_INVALID_DATE } };
}

export function fakeManualWithEstimate(product: Product): Product {
  return { ...fakeManualPrice(product, FAKE_BASE_PRICE), estimate: { value: FAKE_ESTIMATE_VALUE, enteredAt: FAKE_ESTIMATE_ENTERED_AT } };
}

export function fakeCentsPrice(iteration: number): number {
  return ((iteration * 7919) % 25001) / 100;
}

export function fakeSubcentPrice(iteration: number): number {
  return fakeCentsPrice(iteration) + FAKE_SUBCENT;
}

export function fakeEstimatedPrice(product: Product, estimate: Product['estimate']): Product {
  return { ...product, price: null, priceState: 'estimativa', priceUpdatedAt: null, estimate };
}

export function fakeBoundedEstimate(iteration: number): NonNullable<Product['estimate']> {
  const value = fakeCentsPrice(iteration);
  return { value, low: Math.max(0, value - 0.01), high: value + 0.01, enteredAt: FAKE_ESTIMATE_ENTERED_AT };
}

export function fakePartialEstimate(iteration: number): NonNullable<Product['estimate']> {
  const value = fakeCentsPrice(iteration);
  return { value, low: Math.max(0, value - 0.01), enteredAt: FAKE_ESTIMATE_ENTERED_AT };
}

export function fakeUnknownWithEstimate(product: Product): Product {
  return { ...product, estimate: { value: FAKE_ESTIMATE_VALUE, enteredAt: FAKE_ESTIMATE_ENTERED_AT } };
}

export function fakeUnknownWithPrice(product: Product): Product {
  return { ...product, price: FAKE_PRICE_ZERO };
}

export function fakeUnknownWithDate(product: Product): Product {
  return { ...product, priceUpdatedAt: FAKE_PRICE_UPDATED_AT };
}

export function fakeEstimateWithKnownPrice(product: Product): Product {
  return { ...fakeEstimatedPrice(product, { value: FAKE_ESTIMATE_VALUE, enteredAt: FAKE_ESTIMATE_ENTERED_AT }), price: FAKE_BASE_PRICE };
}

export function fakeEstimateWithoutEnteredAt(product: Product): Product {
  return { ...fakeEstimatedPrice(product, { value: FAKE_ESTIMATE_VALUE, enteredAt: ' ' }) };
}
