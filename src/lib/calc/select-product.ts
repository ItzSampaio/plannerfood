import type { Catalogue, PriceState, Product, ProductSelection, SellingModel, UserProfile } from '../types';
import { toCents } from '../money';
import { isProductOverrideSafe, safeProductsFor } from '../safety/products';

export function effectivePackPriceCents(product: Product, today: string): number | null {
  if (sellingModel(product) !== 'fixed_package') return null;
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

export function sellingModel(product: Product): SellingModel { return product.sellingModel ?? 'fixed_package'; }

function effectiveUnitPriceCents(product: Product, today: string): number | null {
  const state = effectiveProductPriceState(product, today);
  if (state === 'desconhecido' || state === 'observado' && product.priceObservation?.checkedDate !== today) return null;
  if (state === 'estimativa') return product.estimate ? toCents(product.estimate.value) : null;
  if (product.sellingModel !== 'fixed_package' && product.unitPrice) return toCents(product.unitPrice.amount);
  return effectivePackPriceCents(product, today);
}

function quantityInPriceUnit(quantity: number, product: Product): number | null {
  const priceUnit = product.unitPrice?.unit;
  if (!priceUnit) return product.unit === 'un' ? quantity : quantity;
  if (priceUnit === 'un') return quantity;
  if (priceUnit === 'kg' && product.unit === 'g') return quantity / 1000;
  if (priceUnit === 'l' && product.unit === 'ml') return quantity / 1000;
  return product.unit === 'un' ? null : quantity;
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
    checkout: checkoutFor(product, quantity, today),
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
  const model = sellingModel(product);
  const unitPriceCents = effectiveUnitPriceCents(product, today);
  const minimum = product.minimumQuantity ?? 0;
  const unitCount = model === 'per_unit' ? product.unit === 'un' ? quantity : product.unitQuantity ? quantity / product.unitQuantity : null : null;
  const purchaseQuantity = model === 'variable_weight' ? Math.max(quantity, minimum) : model === 'per_unit' && unitCount !== null ? Math.ceil(Math.max(unitCount, minimum)) : null;
  const actualQuantity = product.actualCheckoutQuantity ?? purchaseQuantity;
  const expectedCheckoutCents = model === 'variable_weight' && unitPriceCents !== null && actualQuantity !== null
    ? Math.round((quantityInPriceUnit(actualQuantity, product) ?? 0) * unitPriceCents)
    : model === 'per_unit' && unitPriceCents !== null && purchaseQuantity !== null ? purchaseQuantity * unitPriceCents : checkoutFor(product, quantity, today);
  const checkoutQuantityKnown = model !== 'variable_weight' || product.actualCheckoutQuantity !== null && product.actualCheckoutQuantity !== undefined;
  const checkoutCents = model === 'variable_weight' && !checkoutQuantityKnown ? null : expectedCheckoutCents;
  const fixedPackSize = product.packSize ?? 0;
  const packs = model === 'fixed_package' ? Math.ceil(quantity / fixedPackSize) : 0;
  const perPackPriceCents = model === 'fixed_package' ? effectivePackPriceCents(product, today) : unitPriceCents;
  return {
    status: 'selected', product, packs, priceState: effectiveProductPriceState(product, today), perPackPriceCents,
    checkoutCents, expectedCheckoutCents, checkoutQuantity: model === 'fixed_package' ? packs * fixedPackSize : actualQuantity,
    checkoutQuantityKnown, consumptionCents: unitPriceCents === null ? null : model === 'fixed_package' ? Math.round(quantity / product.packSize * unitPriceCents) : Math.round((quantityInPriceUnit(quantity, product) ?? 0) * unitPriceCents),
  };
}

function checkoutFor(product: Product, quantity: number, today: string): number | null {
  if (sellingModel(product) === 'fixed_package') {
    const price = effectivePackPriceCents(product, today);
    return price === null || product.packSize === null ? null : Math.ceil(quantity / product.packSize) * price;
  }
  return null;
}
