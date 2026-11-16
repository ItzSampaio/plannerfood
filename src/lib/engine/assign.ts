import type { MealType, PlanDay, Recipe, Weekday } from '../types';
import { rankCandidatesForSlot } from './score';
import type { CandidateEvaluation, EngineSlot, GenerationResult, ScoredCandidate, SlotFailure } from './types';

export const MAX_SEARCH_NODES = 10_000;
const WEEKDAYS: Weekday[] = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];

export type SlotCandidates = { slot: EngineSlot; candidates: ScoredCandidate[]; evaluations: CandidateEvaluation[] };
type SearchState = { assignments: Map<number, Recipe>; counts: Map<string, number>; days: Map<number, Set<string>> };

function canAssign(slotIndex: number, recipe: Recipe, slots: readonly SlotCandidates[], state: SearchState): boolean {
  if ((state.counts.get(recipe.id) ?? 0) >= 2) return false;
  const dayIndex = slots[slotIndex]?.slot.dayIndex;
  return dayIndex !== undefined && !state.days.get(dayIndex)?.has(recipe.id);
}

function addAssignment(slotIndex: number, recipe: Recipe, slots: readonly SlotCandidates[], state: SearchState): void {
  const dayIndex = slots[slotIndex]?.slot.dayIndex;
  if (dayIndex === undefined) return;
  state.assignments.set(slotIndex, recipe);
  state.counts.set(recipe.id, (state.counts.get(recipe.id) ?? 0) + 1);
  const dayRecipes = state.days.get(dayIndex) ?? new Set<string>();
  dayRecipes.add(recipe.id);
  state.days.set(dayIndex, dayRecipes);
}

function removeAssignment(slotIndex: number, recipe: Recipe, slots: readonly SlotCandidates[], state: SearchState): void {
  const dayIndex = slots[slotIndex]?.slot.dayIndex;
  if (dayIndex === undefined) return;
  state.assignments.delete(slotIndex);
  const count = (state.counts.get(recipe.id) ?? 1) - 1;
  if (count <= 0) state.counts.delete(recipe.id);
  else state.counts.set(recipe.id, count);
  const dayRecipes = state.days.get(dayIndex);
  dayRecipes?.delete(recipe.id);
  if (dayRecipes?.size === 0) state.days.delete(dayIndex);
}

function failureReasons(slot: SlotCandidates, state: SearchState): SlotFailure['reasons'] {
  const eligible = new Set(slot.candidates.map((candidate) => candidate.recipe.id));
  if (eligible.size === 0) return [...new Set(slot.evaluations.flatMap((evaluation) => evaluation.reasons))];
  const dayRecipes = state.days.get(slot.slot.dayIndex);
  const reasons: ('repeticao' | 'mesmo_dia')[] = [];
  if (slot.candidates.every((candidate) => (state.counts.get(candidate.recipe.id) ?? 0) >= 2)) reasons.push('repeticao');
  if (slot.candidates.every((candidate) => dayRecipes?.has(candidate.recipe.id))) reasons.push('mesmo_dia');
  return reasons.length ? reasons : ['sem_candidatos'];
}

function makeDays(slots: readonly SlotCandidates[], assignments: ReadonlyMap<number, Recipe>): PlanDay[] {
  return WEEKDAYS.map((day, dayIndex) => ({
    day,
    slots: slots.flatMap((entry, index) => {
      if (entry.slot.dayIndex !== dayIndex) return [];
      const recipe = assignments.get(index);
      return recipe ? [{ mealType: entry.slot.mealType, recipeId: recipe.id, locked: entry.slot.locked ?? entry.slot.lockedRecipeId !== undefined }] : [];
    }),
  }));
}

export function assignSlots(slots: readonly SlotCandidates[], nodeLimit = MAX_SEARCH_NODES): GenerationResult {
  const state: SearchState = { assignments: new Map(), counts: new Map(), days: new Map() };
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const lockedId = slot?.slot.lockedRecipeId;
    if (lockedId === undefined) continue;
    const locked = slot.candidates.find((candidate) => candidate.recipe.id === lockedId)?.recipe;
    if (!locked || !canAssign(index, locked, slots, state)) {
      const lockedEvaluation = slot.evaluations.find((evaluation) => evaluation.recipe.id === lockedId);
      const reasons = lockedEvaluation && !lockedEvaluation.eligible ? [...lockedEvaluation.reasons, 'locked_invalido' as const] : ['locked_invalido' as const];
      return { ok: false, reason: 'sem_candidatos', failingSlots: [{ day: WEEKDAYS[slot.slot.dayIndex] ?? 'segunda', mealType: slot.slot.mealType, reasons }], nodesUsed: 0 };
    }
    addAssignment(index, locked, slots, state);
  }
  let nodesUsed = 0;
  let limitReached = false;
  let greedySucceeded = true;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (!slot || slot.slot.lockedRecipeId !== undefined) continue;
    const ordered = rankCandidatesForSlot(slot.candidates, state.counts);
    let chosen: Recipe | undefined;
    for (const candidate of ordered) {
      if (nodesUsed >= nodeLimit) { limitReached = true; break; }
      nodesUsed += 1;
      if (canAssign(index, candidate.recipe, slots, state)) { chosen = candidate.recipe; break; }
    }
    if (!chosen || limitReached) { greedySucceeded = false; break; }
    addAssignment(index, chosen, slots, state);
  }
  if (greedySucceeded) return { ok: true, days: makeDays(slots, state.assignments), nodesUsed };
  if (limitReached) return failureResult('limite_de_nos', slots, state, nodesUsed, 'limite_de_nos');

  const searchState: SearchState = { assignments: new Map(), counts: new Map(), days: new Map() };
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    const lockedId = slot?.slot.lockedRecipeId;
    if (lockedId === undefined) continue;
    const recipe = slot.candidates.find((candidate) => candidate.recipe.id === lockedId)?.recipe;
    if (recipe) addAssignment(index, recipe, slots, searchState);
  }
  const deadSlots = new Set<number>();
  const search = (): boolean => {
    if (searchState.assignments.size === slots.length) return true;
    let selectedIndex = -1;
    let selectedOptions: ScoredCandidate[] = [];
    for (let index = 0; index < slots.length; index += 1) {
      if (searchState.assignments.has(index)) continue;
      const slot = slots[index];
      if (!slot) continue;
      const options = rankCandidatesForSlot(slot.candidates, searchState.counts).filter((candidate) => canAssign(index, candidate.recipe, slots, searchState));
      if (options.length === 0) { deadSlots.add(index); return false; }
      if (selectedIndex === -1 || options.length < selectedOptions.length) {
        selectedIndex = index;
        selectedOptions = options;
      }
    }
    if (selectedIndex < 0) return false;
    for (const candidate of selectedOptions) {
      if (nodesUsed >= nodeLimit) { limitReached = true; return false; }
      nodesUsed += 1;
      addAssignment(selectedIndex, candidate.recipe, slots, searchState);
      let forwardChecked = true;
      for (let index = 0; index < slots.length; index += 1) {
        if (searchState.assignments.has(index)) continue;
        const slot = slots[index];
        if (!slot || !slot.candidates.some((option) => canAssign(index, option.recipe, slots, searchState))) {
          deadSlots.add(index);
          forwardChecked = false;
          break;
        }
      }
      if (forwardChecked && search()) return true;
      removeAssignment(selectedIndex, candidate.recipe, slots, searchState);
      if (limitReached) return false;
    }
    deadSlots.add(selectedIndex);
    return false;
  };

  if (search()) return { ok: true, days: makeDays(slots, searchState.assignments), nodesUsed };
  if (limitReached) return failureResult('limite_de_nos', slots, searchState, nodesUsed, 'limite_de_nos');
  const affected = deadSlots.size > 0 ? [...deadSlots] : slots.map((_, index) => index).filter((index) => !searchState.assignments.has(index));
  const failingSlots = affected.map((index) => {
    const slot = slots[index];
    return { day: WEEKDAYS[slot?.slot.dayIndex ?? 0] ?? 'segunda', mealType: slot?.slot.mealType ?? ('almoco' as MealType), reasons: slot ? failureReasons(slot, searchState) : ['sem_candidatos' as const] };
  });
  return { ok: false, reason: 'sem_candidatos', failingSlots, nodesUsed };
}

function failureResult(reason: 'sem_candidatos' | 'limite_de_nos', slots: readonly SlotCandidates[], state: SearchState, nodesUsed: number, detail: 'limite_de_nos'): GenerationResult {
  const failingSlots = slots.flatMap((slot, index) => state.assignments.has(index) ? [] : [{
    day: WEEKDAYS[slot.slot.dayIndex] ?? 'segunda', mealType: slot.slot.mealType, reasons: [detail] as SlotFailure['reasons'],
  }]);
  return { ok: false, reason, failingSlots, nodesUsed };
}
