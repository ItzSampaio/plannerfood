import type { Basket, BasketLine, Catalogue, Plan, PriceState, Slot } from '../types';
import { toCents } from '../money';
import { computeBasket } from '../calc/basket';
import { getBudgetStatus } from '../calc/budget-status';
import { getSwapCandidates, swapRecipe } from '../engine/regenerate';
import { safeProductsFor } from '../safety/products';
import { selectProduct } from '../calc/select-product';

export const MAX_OPTIMISER_STEPS = 50;

export type OptimiserAction =
  | { kind: 'product'; ingredientId: string; fromProductId: string; toProductId: string; savingCents: number }
  | { kind: 'recipe'; day: string; mealType: Slot['mealType']; fromRecipeId: string; toRecipeId: string; savingCents: number };
export type CostDriver = { ingredientId: string; name: string; checkoutCents: number; userOverride: boolean };
export type OptimiserResult = {
  plan: Plan;
  actions: OptimiserAction[];
  before: Basket;
  after: Basket;
  outcome: ReturnType<typeof getBudgetStatus>;
  topCostDrivers: CostDriver[];
  stepsUsed: number;
};

type ProductOpportunity = { plan: Plan; ingredientId: string; fromProductId: string; toProductId: string; savingCents: number };
type RecipeOpportunity = { plan: Plan; day: string; dayIndex: number; mealType: Slot['mealType']; fromRecipeId: string; toRecipeId: string; savingCents: number };

function certainty(state: PriceState): number {
  switch (state) {
    case 'manual': case 'verificado': return 0;
    case 'observado': case 'estimativa': return 1;
    case 'desconhecido': return 2;
  }
}

function lineCertainty(line: BasketLine | undefined): number {
  if (!line) return 0;
  if (line.quantityUncertain) return 4;
  if (line.selection.status === 'unavailable') return 3;
  switch (line.selection.priceState) {
    case 'manual': case 'verificado': return 0;
    case 'observado': case 'estimativa': return 1;
    case 'desconhecido': return 2;
  }
}

function basketCertaintyDoesNotWorsen(before: Basket, after: Basket): boolean {
  const previousLines = new Map(before.lines.map((line) => [line.ingredientId, line]));
  for (const line of after.lines) {
    if (line.owned) continue;
    const prior = previousLines.get(line.ingredientId);
    if (lineCertainty(line) > lineCertainty(prior)) return false;
    if (prior?.selection.status === 'selected' && line.selection.status === 'selected'
      && prior.selection.priceState === 'estimativa' && line.selection.priceState === 'estimativa') {
      const hadBounds = prior.selection.product.estimate?.low !== undefined && prior.selection.product.estimate.high !== undefined;
      const hasBounds = line.selection.product.estimate?.low !== undefined && line.selection.product.estimate.high !== undefined;
      if (hadBounds && !hasBounds) return false;
    }
  }
  return true;
}

function findBestProductOpportunity(plan: Plan, catalogue: Catalogue, today: string, basket: Basket): ProductOpportunity | undefined {
  let best: ProductOpportunity | undefined;
  const overridden = new Set(Object.keys(plan.productOverrides));
  for (const line of basket.lines) {
    if (line.owned || line.quantity === null || overridden.has(line.ingredientId) || line.selection.status !== 'selected') continue;
    const current = line.selection;
    if (current.checkoutCents === null) continue;
    for (const product of safeProductsFor(line.ingredientId, plan.profile, catalogue)) {
      if (product.id === current.product.id || certainty(product.priceState) > certainty(current.priceState)) continue;
      const proposed = selectProduct(line.ingredientId, line.quantity, plan.profile, catalogue, today, product.id);
      if (proposed.status !== 'selected' || proposed.checkoutCents === null) continue;
      const savingCents = current.checkoutCents - proposed.checkoutCents;
      if (savingCents <= 0) continue;
      const opportunity = {
        plan: { ...plan, productOverrides: { ...plan.productOverrides, [line.ingredientId]: product.id } },
        ingredientId: line.ingredientId, fromProductId: current.product.id, toProductId: product.id, savingCents,
      };
      if (!best || savingCents > best.savingCents || (savingCents === best.savingCents && `${line.ingredientId}:${product.id}` < `${best.ingredientId}:${best.toProductId}`)) best = opportunity;
    }
  }
  return best;
}

function findBestRecipeOpportunity(plan: Plan, catalogue: Catalogue, today: string, basket: Basket): RecipeOpportunity | undefined {
  let best: RecipeOpportunity | undefined;
  for (const [dayIndex, day] of plan.days.entries()) for (const slot of day.slots) {
    if (slot.locked) continue;
    const alternatives = getSwapCandidates(plan, dayIndex, slot.mealType, catalogue, today)
      .sort((left, right) => left.id.localeCompare(right.id));
    for (const recipe of alternatives) {
      const swapped = swapRecipe(plan, dayIndex, slot.mealType, recipe.id, catalogue, today);
      if (!swapped.ok) continue;
      const candidatePlan = { ...plan, days: swapped.days };
      const candidateBasket = computeBasket(candidatePlan, catalogue, today);
      if (!basketCertaintyDoesNotWorsen(basket, candidateBasket)) continue;
      const savingCents = basket.estimatedTotalCents - candidateBasket.estimatedTotalCents;
      if (savingCents <= 0) continue;
      const opportunity = {
        plan: candidatePlan, day: day.day, dayIndex, mealType: slot.mealType,
        fromRecipeId: slot.recipeId, toRecipeId: recipe.id, savingCents,
      };
      if (!best || savingCents > best.savingCents || (savingCents === best.savingCents && `${dayIndex}:${slot.mealType}:${recipe.id}` < `${best.dayIndex}:${best.mealType}:${best.toRecipeId}`)) best = opportunity;
    }
  }
  return best;
}

function topDrivers(basket: Basket, originalOverrides: ReadonlySet<string>): CostDriver[] {
  return basket.lines.flatMap((line: BasketLine) => line.checkoutCents !== null && line.checkoutCents > 0
    ? [{ ingredientId: line.ingredientId, name: line.ingredientName, checkoutCents: line.checkoutCents, userOverride: originalOverrides.has(line.ingredientId) }]
    : []).sort((left, right) => right.checkoutCents - left.checkoutCents || left.ingredientId.localeCompare(right.ingredientId)).slice(0, 3);
}

export function optimisePlan(plan: Plan, catalogue: Catalogue, today: string): OptimiserResult {
  const initialBasket = computeBasket(plan, catalogue, today);
  let currentPlan = plan;
  let currentBasket = initialBasket;
  const actions: OptimiserAction[] = [];
  const budgetCents = toCents(plan.profile.weeklyBudget);
  let stepsUsed = 0;

  while (stepsUsed < MAX_OPTIMISER_STEPS && currentBasket.estimatedTotalCents > budgetCents) {
    const productOpportunity = findBestProductOpportunity(currentPlan, catalogue, today, currentBasket);
    if (productOpportunity) {
      const updatedBasket = computeBasket(productOpportunity.plan, catalogue, today);
      const savingCents = currentBasket.estimatedTotalCents - updatedBasket.estimatedTotalCents;
      if (savingCents > 0) {
        actions.push({ kind: 'product', ingredientId: productOpportunity.ingredientId, fromProductId: productOpportunity.fromProductId, toProductId: productOpportunity.toProductId, savingCents });
        currentPlan = productOpportunity.plan;
        currentBasket = updatedBasket;
        stepsUsed += 1;
        continue;
      }
    }
    const recipeOpportunity = findBestRecipeOpportunity(currentPlan, catalogue, today, currentBasket);
    if (!recipeOpportunity) break;
    actions.push({ kind: 'recipe', day: recipeOpportunity.day, mealType: recipeOpportunity.mealType, fromRecipeId: recipeOpportunity.fromRecipeId, toRecipeId: recipeOpportunity.toRecipeId, savingCents: recipeOpportunity.savingCents });
    currentPlan = recipeOpportunity.plan;
    currentBasket = computeBasket(currentPlan, catalogue, today);
    stepsUsed += 1;
  }

  return {
    plan: currentPlan, actions, before: initialBasket, after: currentBasket,
    outcome: getBudgetStatus(currentBasket, budgetCents),
    topCostDrivers: currentBasket.estimatedTotalCents > budgetCents ? topDrivers(currentBasket, new Set(Object.keys(plan.productOverrides))) : [],
    stepsUsed,
  };
}
