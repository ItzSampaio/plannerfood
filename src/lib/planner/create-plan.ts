import type { Catalogue, Plan, UserProfile } from '../types';
import { generateWeek } from '../engine/generate';
import type { GenerationResult } from '../engine/types';

export type PlanCreation =
  | { ok: true; plan: Plan; nodesUsed: number }
  | { ok: false; result: Extract<GenerationResult, { ok: false }> };

/** Compose the Phase 3 assignment with the persisted Phase 2 plan shape. */
export function createWeeklyPlan(
  profile: UserProfile,
  catalogue: Catalogue,
  today: string,
  planId: string,
  createdAt: string,
  seed = 0,
): PlanCreation {
  const generation = generateWeek(profile, catalogue, today, seed);
  if (!generation.ok) return { ok: false, result: generation };
  return {
    ok: true,
    nodesUsed: generation.nodesUsed,
    plan: {
      id: planId,
      createdAt,
      profile: structuredClone(profile),
      days: generation.days,
      productOverrides: {},
      purchased: {},
    },
  };
}
