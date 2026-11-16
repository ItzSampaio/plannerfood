import type { Catalogue, Plan, Priority, Recipe, UserProfile } from '../types';
import { computeBasket } from '../calc/basket';
import type { CandidateEvaluation, ScoredCandidate } from './types';

function seededFraction(seed: number, text: string): number {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  for (const character of text) state = Math.imul(state ^ character.charCodeAt(0), 0x85ebca6b) >>> 0;
  state ^= state >>> 16;
  state = Math.imul(state, 0x7feb352d) >>> 0;
  state ^= state >>> 15;
  return (state >>> 0) / 4294967296;
}

function recipeCost(recipe: Recipe, profile: UserProfile, catalogue: Catalogue, today: string): { known: boolean; cents: number } {
  const scoringProfile: UserProfile = { ...profile, ownedIngredientIds: [] };
  const plan: Plan = {
    id: 'score', createdAt: '', profile: scoringProfile,
    days: [{ day: 'segunda', slots: [{ mealType: recipe.mealTypes[0] ?? 'almoco', recipeId: recipe.id, locked: false }] }],
    productOverrides: {}, purchased: {},
  };
  const basket = computeBasket(plan, catalogue, today);
  return { known: !basket.consumptionIncomplete, cents: basket.consumptionTotalCents / Math.max(1, profile.people) };
}

function compareCost(leftCost: { known: boolean; cents: number }, rightCost: { known: boolean; cents: number }): number {
  return Number(rightCost.known) - Number(leftCost.known) || leftCost.cents - rightCost.cents;
}

function healthScore(recipe: Recipe): number {
  return Number(recipe.tags.includes('saudavel')) * 2 + Number(recipe.tags.includes('economica'));
}

function compareForPriority(left: Recipe, right: Recipe, priority: Priority, costs: Map<string, { known: boolean; cents: number }>, valueRanks: Map<string, number>): number {
  const leftCost = costs.get(left.id) ?? { known: false, cents: 0 };
  const rightCost = costs.get(right.id) ?? { known: false, cents: 0 };
  const costComparison = compareCost(leftCost, rightCost);
  const leftHealth = healthScore(left);
  const rightHealth = healthScore(right);
  switch (priority) {
    case 'mais_barato': return costComparison;
    case 'saudavel': return rightHealth - leftHealth || left.prepMinutes - right.prepMinutes;
    case 'rapido': return left.prepMinutes - right.prepMinutes || rightHealth - leftHealth;
    case 'melhor_valor': return (valueRanks.get(right.id) ?? 0) - (valueRanks.get(left.id) ?? 0) || left.prepMinutes - right.prepMinutes;
  }
}

export function scoreCandidates(evaluations: readonly CandidateEvaluation[], profile: UserProfile, catalogue: Catalogue, today: string, seed = 0): ScoredCandidate[] {
  const eligible = evaluations.filter((evaluation) => evaluation.eligible);
  const costs = new Map(eligible.map(({ recipe }) => [recipe.id, recipeCost(recipe, profile, catalogue, today)]));
  const distinctCostKeys = [...new Set(eligible.map(({ recipe }) => {
    const cost = costs.get(recipe.id) ?? { known: false, cents: 0 };
    return `${cost.known ? 'known' : 'unknown'}:${cost.cents}`;
  }))].sort((left, right) => {
    const [leftCertainty, leftCents] = left.split(':');
    const [rightCertainty, rightCents] = right.split(':');
    return Number(rightCertainty === 'known') - Number(leftCertainty === 'known') || Number(leftCents) - Number(rightCents);
  });
  const valueRanks = new Map(distinctCostKeys.map((key, index) => [key, distinctCostKeys.length - index]));
  const valueRankFor = (recipe: Recipe): number => {
    const cost = costs.get(recipe.id) ?? { known: false, cents: 0 };
    return healthScore(recipe) * 2 + (valueRanks.get(`${cost.known ? 'known' : 'unknown'}:${cost.cents}`) ?? 0);
  };
  const candidateValueRanks = new Map(eligible.map(({ recipe }) => [recipe.id, valueRankFor(recipe)]));
  const ranked = [...eligible].sort((left, right) => compareForPriority(left.recipe, right.recipe, profile.priority, costs, candidateValueRanks)
    || left.recipe.id.localeCompare(right.recipe.id)
    || seededFraction(seed, left.recipe.id) - seededFraction(seed, right.recipe.id));
  return ranked.map(({ recipe }, index) => ({ recipe, score: ranked.length - index, perturbation: seededFraction(seed, recipe.id) }));
}

export function rankCandidatesForSlot(candidates: readonly ScoredCandidate[], recipeUseCounts: ReadonlyMap<string, number>): ScoredCandidate[] {
  return [...candidates].sort((left, right) => {
    const leftScore = left.score - (recipeUseCounts.get(left.recipe.id) ?? 0) * 1.25;
    const rightScore = right.score - (recipeUseCounts.get(right.recipe.id) ?? 0) * 1.25;
    return rightScore - leftScore || left.recipe.id.localeCompare(right.recipe.id) || left.perturbation - right.perturbation;
  });
}
