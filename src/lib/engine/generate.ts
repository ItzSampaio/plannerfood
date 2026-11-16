import type { Catalogue, MealType, UserProfile } from '../types';
import { assignSlots, MAX_SEARCH_NODES, type SlotCandidates } from './assign';
import { buildCandidates } from './candidates';
import { scoreCandidates } from './score';
import type { EngineSlot, GenerationResult } from './types';

export function generateWeek(profile: UserProfile, catalogue: Catalogue, today: string, seed = 0, nodeLimit = MAX_SEARCH_NODES): GenerationResult {
  const slots: SlotCandidates[] = [];
  const byMealType = new Map<MealType, Omit<SlotCandidates, 'slot'>>();
  for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) for (const mealType of profile.mealTypes) {
    const engineSlot: EngineSlot = { dayIndex, mealType };
    let shared = byMealType.get(mealType);
    if (!shared) {
      const evaluations = buildCandidates(mealType, profile, catalogue);
      shared = { evaluations, candidates: scoreCandidates(evaluations, profile, catalogue, today, seed) };
      byMealType.set(mealType, shared);
    }
    slots.push({ slot: engineSlot, ...shared });
  }
  return assignSlots(slots, nodeLimit);
}

export function validateRecipeForSlot(recipeId: string, mealType: MealType, profile: UserProfile, catalogue: Catalogue): boolean {
  return buildCandidates(mealType, profile, catalogue).some((candidate) => candidate.recipe.id === recipeId && candidate.eligible);
}
