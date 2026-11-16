import type { Catalogue, Plan, Recipe, Weekday } from '../types';
import { assignSlots, MAX_SEARCH_NODES, type SlotCandidates } from './assign';
import { buildCandidates } from './candidates';
import { scoreCandidates } from './score';
import type { GenerationResult } from './types';

const WEEKDAYS: Weekday[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

function findSlotRecipe(plan: Plan, dayIndex: number, mealType: Plan['profile']['mealTypes'][number]): string | undefined {
  return plan.days[dayIndex]?.slots.find((slot) => slot.mealType === mealType)?.recipeId;
}

function makeCandidates(plan: Plan, catalogue: Catalogue, today: string, seed: number, target?: { dayIndex: number; mealType: Plan['profile']['mealTypes'][number]; excludedRecipeId?: string; replaceWith?: string }): SlotCandidates[] {
  const slots: SlotCandidates[] = [];
  plan.days.forEach((day, dayIndex) => day.slots.forEach((existing) => {
    const isTarget = target?.dayIndex === dayIndex && target.mealType === existing.mealType;
    const lockId = isTarget ? target?.replaceWith : existing.recipeId;
    const evaluations = buildCandidates(existing.mealType, plan.profile, catalogue);
    const scored = scoreCandidates(evaluations, plan.profile, catalogue, today, seed);
    const candidates = scored.filter((candidate) => candidate.recipe.id !== (isTarget ? target?.excludedRecipeId : undefined));
    slots.push({
      slot: { dayIndex, mealType: existing.mealType, ...(lockId !== undefined ? { lockedRecipeId: lockId } : {}), locked: existing.locked },
      evaluations, candidates,
    });
  }));
  return slots;
}

export function regenerateWeek(plan: Plan, catalogue: Catalogue, today: string, seed = 0, nodeLimit = MAX_SEARCH_NODES): GenerationResult {
  const slots: SlotCandidates[] = [];
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) for (const mealType of plan.profile.mealTypes) {
    const existing = plan.days[dayIndex]?.slots.find((slot) => slot.mealType === mealType);
    const evaluations = buildCandidates(mealType, plan.profile, catalogue);
    slots.push({
      slot: { dayIndex, mealType, ...(existing?.locked ? { lockedRecipeId: existing.recipeId } : {}), locked: existing?.locked ?? false },
      evaluations, candidates: scoreCandidates(evaluations, plan.profile, catalogue, today, seed),
    });
  }
  return assignSlots(slots, nodeLimit);
}

export function regenerateSlot(plan: Plan, dayIndex: number, mealType: Plan['profile']['mealTypes'][number], catalogue: Catalogue, today: string, seed = 0, nodeLimit = MAX_SEARCH_NODES): GenerationResult {
  const current = findSlotRecipe(plan, dayIndex, mealType);
  const targetSlot = plan.days[dayIndex]?.slots.find((slot) => slot.mealType === mealType);
  if (!current || targetSlot?.locked) {
    return { ok: false, reason: 'sem_candidatos', failingSlots: [{ day: plan.days[dayIndex]?.day ?? 'segunda', mealType, reasons: ['locked_invalido'] }], nodesUsed: 0 };
  }
  const slots = makeCandidates(plan, catalogue, today, seed, { dayIndex, mealType, excludedRecipeId: current });
  return assignSlots(slots, nodeLimit);
}

export function getSwapCandidates(plan: Plan, dayIndex: number, mealType: Plan['profile']['mealTypes'][number], catalogue: Catalogue, today: string, seed = 0): Recipe[] {
  const currentId = findSlotRecipe(plan, dayIndex, mealType);
  if (!currentId || plan.days[dayIndex]?.slots.find((slot) => slot.mealType === mealType)?.locked) return [];
  const uses = new Map<string, number>();
  const sameDay = new Set<string>();
  for (const [index, day] of plan.days.entries()) for (const slot of day.slots) {
    if (index === dayIndex && slot.mealType === mealType) continue;
    uses.set(slot.recipeId, (uses.get(slot.recipeId) ?? 0) + 1);
    if (index === dayIndex) sameDay.add(slot.recipeId);
  }
  const evaluations = buildCandidates(mealType, plan.profile, catalogue);
  return scoreCandidates(evaluations, plan.profile, catalogue, today, seed)
    .map((candidate) => candidate.recipe)
    .filter((recipe) => recipe.id !== currentId && (uses.get(recipe.id) ?? 0) < 2 && !sameDay.has(recipe.id));
}

export function swapRecipe(plan: Plan, dayIndex: number, mealType: Plan['profile']['mealTypes'][number], recipeId: string, catalogue: Catalogue, today: string, nodeLimit = MAX_SEARCH_NODES): GenerationResult {
  const target = plan.days[dayIndex]?.slots.find((slot) => slot.mealType === mealType);
  if (!target) return { ok: false, reason: 'sem_candidatos', failingSlots: [{ day: plan.days[dayIndex]?.day ?? WEEKDAYS[dayIndex] ?? 'segunda', mealType, reasons: ['sem_candidatos'] }], nodesUsed: 0 };
  if (target.locked) return { ok: false, reason: 'sem_candidatos', failingSlots: [{ day: plan.days[dayIndex]?.day ?? 'segunda', mealType, reasons: ['locked_invalido'] }], nodesUsed: 0 };
  const slots: SlotCandidates[] = [];
  plan.days.forEach((day, index) => day.slots.forEach((existing) => {
    const evaluations = buildCandidates(existing.mealType, plan.profile, catalogue);
    const candidates = scoreCandidates(evaluations, plan.profile, catalogue, today);
    slots.push({
      slot: {
        dayIndex: index, mealType: existing.mealType,
        lockedRecipeId: index === dayIndex && existing.mealType === mealType ? recipeId : existing.recipeId,
        locked: existing.locked,
      },
      evaluations, candidates,
    });
  }));
  return assignSlots(slots, nodeLimit);
}

