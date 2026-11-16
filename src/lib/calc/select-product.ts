import type { Catalogue, PriceState, Product, ProductSelection, UserProfile } from '../types';
import { toCents } from '../money';
import { isProductOverrideSafe, safeProductsFor } from '../safety/products';

export function effectivePackPriceCents(product: Product, today: string): number | null {
  switch (product.priceState) {
    case 'manual':
    case 'verificado':
      if (product.price === null) return null;
      return toCents(product.promo && product.promo.validUntil >= today && product.promo.price < product.price ? product.promo.price : product.price);
    case 'observado':
      if (product.price === null || product.priceObservation?.availability !== 'available' || product.priceObservation.checkedDate !== today) return null;
      return toCents(product.price);
    case 'estimativa': return product.estimate ? toCents(product.estimate.value) : null;
    case 'desconhecido': return null;
  }
}

export function effectiveProductPriceState(product: Product, today: string): PriceState {
  if (product.priceState === 'observado' && (product.priceObservation?.availability !== 'available' || product.priceObservation.checkedDate !== today)) return 'desconhecido';
  if (product.availability === 'unavailable') return 'desconhecido';
  return product.priceState;
}

function tier(product: Product, today: string): number {
  switch (effectiveProductPriceState(product, today)) {
    case 'manual': case 'verificado': return 0;
    case 'observado': return 1;
    case 'estimativa': return 2;
    case 'desconhecido': return 3;
  }
}

export function selectProduct(ingredientId: string, quantity: number, profile: UserProfile, catalogue: Catalogue, today: string, overrideId?: string): ProductSelection {
  const candidates = safeProductsFor(ingredientId, profile, catalogue);
  if (overrideId) {
    const override = candidates.find((product) => product.id === overrideId);
    const ingredient = catalogue.ingredients.find((entry) => entry.id === ingredientId);
    const requestedProduct = catalogue.products.find((product) => product.id === overrideId);
    if (!override) {
      if (requestedProduct && ingredient && !isProductOverrideSafe(requestedProduct, ingredient, profile)) {
        return { status: 'unavailable', reason: 'unsafe_override' };
      }
      return { status: 'unavailable', reason: 'no_safe_product' };
    }
    return selection(override, quantity, today);
  }
  if (!candidates.length) return { status: 'unavailable', reason: 'no_safe_product' };
  const ranked = candidates.map((product) => ({
    product,
    checkout: effectivePackPriceCents(product, today) === null ? null : Math.ceil(quantity / product.packSize) * (effectivePackPriceCents(product, today) ?? 0),
  })).sort((left, right) => {
    const tierDiff = tier(left.product, today) - tier(right.product, today);
    if (tierDiff !== 0) return tierDiff;
    if (left.checkout !== null && right.checkout !== null && left.checkout !== right.checkout) return left.checkout - right.checkout;
    return left.product.id.localeCompare(right.product.id);
  });
  const chosen = ranked[0]?.product;
  return chosen ? selection(chosen, quantity, today) : { status: 'unavailable', reason: 'no_safe_product' };
}

function selection(product: Product, quantity: number, today: string): ProductSelection {
  const packs = Math.ceil(quantity / product.packSize);
  const perPackPriceCents = effectivePackPriceCents(product, today);
  return {
    status: 'selected', product, packs, priceState: effectiveProductPriceState(product, today), perPackPriceCents,
    checkoutCents: perPackPriceCents === null ? null : packs * perPackPriceCents,
    consumptionCents: perPackPriceCents === null ? null : Math.round(quantity / product.packSize * perPackPriceCents),
  };
}
