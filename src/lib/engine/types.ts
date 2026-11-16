import type { MealType, PlanDay, Recipe } from '../types';

export type ExclusionReason = 'alergenio' | 'dieta' | 'produto_indisponivel' | 'exclusao_texto' | 'tipo_refeicao';
export type CandidateEvaluation = { recipe: Recipe; eligible: boolean; reasons: ExclusionReason[] };
export type EngineSlot = { dayIndex: number; mealType: MealType; lockedRecipeId?: string; locked?: boolean; excludedRecipeIds?: string[] };
export type ScoredCandidate = { recipe: Recipe; score: number; perturbation: number };
export type FailureReason = ExclusionReason | 'sem_candidatos' | 'repeticao' | 'mesmo_dia' | 'locked_invalido' | 'limite_de_nos';
export type SlotFailure = { day: PlanDay['day']; mealType: MealType; reasons: FailureReason[] };
export type AssignmentSuccess = { ok: true; days: PlanDay[]; nodesUsed: number };
export type AssignmentFailure = { ok: false; reason: 'sem_candidatos' | 'limite_de_nos'; failingSlots: SlotFailure[]; nodesUsed: number };
export type GenerationResult = AssignmentSuccess | AssignmentFailure;
