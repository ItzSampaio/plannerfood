import type { Basket, BasketLine, Catalogue, Plan, ProductSelection } from '../types';
import { toCents } from '../money';
import { consolidateNeeds } from './consolidate';
import { selectProduct } from './select-product';

export function computeBasket(plan: Plan, catalogue: Catalogue, today: string): Basket {
  const ownedIds = new Set(plan.profile.ownedIngredientIds);
  const lines: BasketLine[] = consolidateNeeds(plan, catalogue).map((need) => {
    const ingredient = catalogue.ingredients.find((entry) => entry.id === need.ingredientId);
    const overrideId = plan.productOverrides[need.ingredientId];
    const selection: ProductSelection = selectProduct(need.ingredientId, need.quantity, plan.profile, catalogue, today, overrideId);
    const owned = ownedIds.has(need.ingredientId);
    if (selection.status === 'unavailable') {
      return {
        ingredientId: need.ingredientId, ingredientName: ingredient?.name ?? need.ingredientId,
        quantity: need.quantityUncertain ? null : need.quantity, quantityUncertain: need.quantityUncertain,
        warnings: need.warnings, owned, selection, checkoutCents: null, consumptionCents: null,
      };
    }
    return {
      ingredientId: need.ingredientId, ingredientName: ingredient?.name ?? need.ingredientId,
      quantity: need.quantityUncertain ? null : need.quantity, quantityUncertain: need.quantityUncertain,
      warnings: need.warnings, owned, selection,
      checkoutCents: owned ? 0 : selection.checkoutCents,
      consumptionCents: selection.consumptionCents,
    };
  });
  let subtotalKnownCents = 0;
  let estimatedTotalCents = 0;
  let consumptionTotalCents = 0;
  let observedTotalCents = 0;
  let consumptionIncomplete = false;
  let hasEstimate = false;
  let hasObservation = false;
  let hasUnknown = false;
  let hasUnavailable = false;
  let hasUncertainQuantity = false;
  let estimateLow = 0;
  let estimateHigh = 0;
  let estimatesBounded = true;
  let estimateCount = 0;
  let hasUnknownEstimateBound = false;
  for (const line of lines) {
    hasUncertainQuantity ||= line.quantityUncertain;
    if (line.selection.status === 'unavailable') {
      hasUnavailable = true;
      consumptionIncomplete = true;
      continue;
    }
    const { product, packs } = line.selection;
    if (line.quantityUncertain) consumptionIncomplete = true;
    if (line.consumptionCents === null) consumptionIncomplete = true;
    else consumptionTotalCents += line.consumptionCents;
    if (line.owned) continue;
    if (product.priceState === 'manual' || product.priceState === 'verificado') {
      const checkout = line.checkoutCents ?? 0;
      subtotalKnownCents += checkout;
      estimatedTotalCents += checkout;
      estimateLow += checkout;
      estimateHigh += checkout;
    } else if (line.selection.priceState === 'observado') {
      hasObservation = true;
      estimatesBounded = false;
      const checkout = line.checkoutCents ?? 0;
      observedTotalCents += checkout;
      estimatedTotalCents += checkout;
    } else if (product.priceState === 'estimativa') {
      hasEstimate = true;
      estimateCount += 1;
      const checkout = line.checkoutCents ?? 0;
      estimatedTotalCents += checkout;
      if (product.estimate?.low === undefined || product.estimate.high === undefined) estimatesBounded = false;
      else {
        estimateLow += packs * toCents(product.estimate.low);
        estimateHigh += packs * toCents(product.estimate.high);
      }
    } else {
      hasUnknown = true;
      hasUnknownEstimateBound = true;
    }
  }
  const unknownLines = lines.filter((line) => !line.owned && line.selection.status === 'selected' && line.selection.priceState === 'desconhecido');
  const rangeCents = estimateCount > 0 && !hasObservation && estimatesBounded && !hasUnknownEstimateBound && !hasUnavailable && !hasUncertainQuantity
    ? { low: estimateLow, high: estimateHigh }
    : null;
  return {
    lines, subtotalKnownCents, estimatedTotalCents, unknownLines, rangeCents,
    consumptionTotalCents, observedTotalCents, consumptionIncomplete, hasEstimate, hasObservation, hasUnknown,
    hasUnavailable, hasUncertainQuantity,
  };
}
