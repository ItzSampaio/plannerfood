import type { Basket, BudgetStatus } from '../types';

export function getBudgetStatus(basket: Basket, budgetCents: number): BudgetStatus {
  if (basket.hasUnknown || basket.hasUnavailable || basket.hasUncertainQuantity) return 'incompleto';
  if (basket.hasEstimate || basket.hasObservation) {
    if (basket.rangeCents && basket.rangeCents.low <= budgetCents && budgetCents < basket.rangeCents.high) return 'incerto';
    return basket.estimatedTotalCents <= budgetCents ? 'provavel_dentro' : 'excede_estimado';
  }
  return basket.estimatedTotalCents <= budgetCents ? 'dentro' : 'excede';
}
