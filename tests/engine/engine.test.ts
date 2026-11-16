import { describe, expect, it } from 'vitest';
import { assignSlots, MAX_SEARCH_NODES, type SlotCandidates } from '../../src/lib/engine/assign';
import { buildCandidates, evaluateRecipe } from '../../src/lib/engine/candidates';
import { generateWeek } from '../../src/lib/engine/generate';
import { getSwapCandidates, regenerateSlot, regenerateWeek, swapRecipe } from '../../src/lib/engine/regenerate';
import { rankCandidatesForSlot, scoreCandidates } from '../../src/lib/engine/score';
import { scaleAmount } from '../../src/lib/calc/scale';
import type { Recipe } from '../../src/lib/types';
import type { CandidateEvaluation } from '../../src/lib/engine/types';
import { createSeededRandom } from '../fixtures/seededRandom';
import { engineCatalogue, enginePlan, engineProfile, engineRecipe } from '../fixtures/FAKE_engine';

describe('meal generation engine', () => {
  it.each(['nenhuma', 'vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'] as const)('generates seven safe meals under dietary mode %s', (dietaryRule) => {
    const mealTypes = ['pequeno_almoco', 'almoco', 'jantar', 'lanche'] as const;
    for (const mealType of mealTypes) {
      const catalogue = engineCatalogue(['a', 'b', 'c', 'd'].map((id) => engineRecipe(`${mealType}-${id}`, { mealTypes: [mealType] })));
      const result = generateWeek(engineProfile({ dietaryRule, mealTypes: [mealType] }), catalogue, '2026-11-16', 5);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.days).toHaveLength(7);
        expect(result.days.every((day) => day.slots.length === 1 && day.slots[0]?.mealType === mealType)).toBe(true);
        const uses = new Map<string, number>();
        for (const day of result.days) {
          const id = day.slots[0]?.recipeId;
          if (id) uses.set(id, (uses.get(id) ?? 0) + 1);
          expect(new Set(day.slots.map((slot) => slot.recipeId)).size).toBe(day.slots.length);
        }
        expect([...uses.values()].every((count) => count <= 2)).toBe(true);
      }
    }
  });

  it('derives allergen safety and rejects recipe ingredient or product allergen conflicts', () => {
    const catalogue = engineCatalogue([engineRecipe('unsafe', { declaredAllergens: ['aipo'] })]);
    catalogue.ingredients[0]!.allergens = ['aipo'];
    expect(evaluateRecipe(catalogue.recipes[0]!, 'almoco', engineProfile({ allergens: ['aipo'] }), catalogue).reasons).toContain('alergenio');

    catalogue.ingredients[0]!.allergens = [];
    catalogue.products[0]!.allergens = ['aipo'];
    expect(evaluateRecipe(catalogue.recipes[0]!, 'almoco', engineProfile({ allergens: ['aipo'] }), catalogue).reasons).toContain('produto_indisponivel');
  });

  it('never places a derived or product-level allergen conflict in a generated week', () => {
    const catalogue = engineCatalogue();
    const celery: typeof catalogue.ingredients[number] = { ...catalogue.ingredients[0]!, id: 'celery', name: 'Aipo', allergens: ['aipo'] };
    catalogue.ingredients.push(celery);
    const unsafeRecipe = engineRecipe('celery-recipe', {
      ingredients: [{ ingredientId: 'celery', amount: 5, unit: 'g' }], declaredAllergens: ['aipo'],
    });
    const sauce: typeof catalogue.ingredients[number] = { ...catalogue.ingredients[0]!, id: 'sauce', name: 'Molho', allergens: [] };
    catalogue.ingredients.push(sauce);
    catalogue.recipes.push(
      unsafeRecipe,
      engineRecipe('product-only-recipe', { ingredients: [{ ingredientId: 'sauce', amount: 10, unit: 'g' }], declaredAllergens: [] }),
      engineRecipe('excluded', { name: 'Prato com tomate' }),
    );
    catalogue.products.push({ ...catalogue.products[0]!, id: 'celery-product', ingredientId: 'celery', allergens: ['aipo'] });
    catalogue.products.push({ ...catalogue.products[0]!, id: 'sauce-product', ingredientId: 'sauce', allergens: ['aipo'] });
    const profile = engineProfile({ allergens: ['aipo'], exclusionText: ['tomate'] });
    const result = generateWeek(profile, catalogue, '2026-11-16');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const selected = result.days.flatMap((day) => day.slots.map((slot) => slot.recipeId));
      expect(selected).not.toContain('celery-recipe');
      expect(selected).not.toContain('product-only-recipe');
      expect(selected).not.toContain('excluded');
      expect(selected.every((id) => ['a', 'b', 'c', 'd'].includes(id))).toBe(true);
    }
  });

  it('rejects unknown allergen data for declared allergies and product diet incompatibility', () => {
    const catalogue = engineCatalogue([engineRecipe('unknown')]);
    catalogue.ingredients[0]!.allergens = 'unknown';
    expect(evaluateRecipe(catalogue.recipes[0]!, 'almoco', engineProfile({ allergens: ['ovo'] }), catalogue).reasons).toContain('alergenio');

    catalogue.ingredients[0]!.allergens = [];
    catalogue.products[0]!.dietCompatibility.vegana = 'incompativel';
    expect(evaluateRecipe(catalogue.recipes[0]!, 'almoco', engineProfile({ dietaryRule: 'vegana' }), catalogue).reasons).toContain('produto_indisponivel');
  });

  it('filters dietary incompatibility, meal mismatch, unavailable products, and free-text exclusions', () => {
    const catalogue = engineCatalogue([
      engineRecipe('diet', { declaredDietCompatibility: { vegetariana: 'incompativel', vegana: 'incompativel', sem_gluten: 'compativel', sem_lactose: 'compativel' } }),
      engineRecipe('meal', { mealTypes: ['jantar'] }),
      engineRecipe('text', { name: 'Sopa de tomate' }),
    ]);
    catalogue.ingredients[0]!.dietCompatibility.vegana = 'incompativel';
    const evaluations = buildCandidates('almoco', engineProfile({ dietaryRule: 'vegana', exclusionText: ['TOMATE'] }), catalogue);
    expect(evaluations[0]?.reasons).toContain('dieta');
    expect(evaluations[1]?.reasons).toContain('tipo_refeicao');
    expect(evaluations[2]?.reasons).toContain('exclusao_texto');
    catalogue.products = [];
    expect(evaluateRecipe(catalogue.recipes[2]!, 'almoco', engineProfile(), catalogue).reasons).toContain('produto_indisponivel');
  });

  it('uses the selected priority and never lets pantry ownership affect scoring', () => {
    const catalogue = engineCatalogue([
      engineRecipe('fast', { prepMinutes: 5, tags: ['rapido'] as Recipe['tags'], ingredients: [{ ingredientId: 'rice', amount: 100, unit: 'g' }] }),
      engineRecipe('healthy', { prepMinutes: 30, tags: ['saudavel'] }),
      engineRecipe('cheap', { prepMinutes: 25, tags: ['economica'], ingredients: [{ ingredientId: 'rice', amount: 50, unit: 'g' }] }),
    ]);
    const evaluations = catalogue.recipes.map((recipe) => ({ recipe, eligible: true, reasons: [] }));
    const fastest = scoreCandidates(evaluations, engineProfile({ priority: 'rapido' }), catalogue, '2026-11-16');
    expect(fastest[0]?.recipe.id).toBe('fast');
    const healthy = scoreCandidates(evaluations, engineProfile({ priority: 'saudavel' }), catalogue, '2026-11-16');
    expect(healthy[0]?.recipe.id).toBe('healthy');
    const cheap = scoreCandidates(evaluations, engineProfile({ priority: 'mais_barato' }), catalogue, '2026-11-16');
    expect(cheap[0]?.recipe.id).toBe('cheap');
    const bestValue = scoreCandidates(evaluations, engineProfile({ priority: 'melhor_valor' }), catalogue, '2026-11-16');
    expect(bestValue[0]?.recipe.id).toBe('healthy');
    const ownedScore = scoreCandidates(evaluations, engineProfile({ priority: 'mais_barato', ownedIngredientIds: ['rice'] }), catalogue, '2026-11-16');
    expect(ownedScore.map((entry) => entry.recipe.id)).toEqual(cheap.map((entry) => entry.recipe.id));
  });

  it('preserves Phase 2 proportional quantity scaling for non-linear ingredients such as eggs', () => {
    expect(scaleAmount({ amount: 3 }, 3, 2)).toBe(4.5);
  });

  it('applies a repetition penalty when ordering remaining candidates', () => {
    const catalogue = engineCatalogue();
    const evaluations = catalogue.recipes.map((recipe) => ({ recipe, eligible: true, reasons: [] }));
    const ranked = scoreCandidates(evaluations, engineProfile(), catalogue, '2026-11-16');
    const first = ranked[0];
    const second = ranked[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first && second) {
      const repeatAware = rankCandidatesForSlot(ranked, new Map([[first.recipe.id, 1]]));
      expect(repeatAware[0]?.recipe.id).toBe(second.recipe.id);
    }
  });

  it('uses a greedy pass then reassigns through backtracking when the first choice blocks completion', () => {
    const a = engineRecipe('a');
    const b = engineRecipe('b');
    const c = engineRecipe('c');
    const candidate = (recipe: Recipe, score: number) => ({ recipe, score, perturbation: 0 });
    const evaluations = (recipes: Recipe[]): CandidateEvaluation[] => recipes.map((recipe) => ({ recipe, eligible: true, reasons: [] }));
    const slots: SlotCandidates[] = [
      { slot: { dayIndex: 0, mealType: 'almoco' }, candidates: [candidate(a, 3), candidate(b, 2)], evaluations: evaluations([a, b]) },
      { slot: { dayIndex: 1, mealType: 'almoco' }, candidates: [candidate(a, 3), candidate(c, 1)], evaluations: evaluations([a, c]) },
      { slot: { dayIndex: 2, mealType: 'almoco' }, candidates: [candidate(a, 3)], evaluations: evaluations([a]) },
    ];
    const result = assignSlots(slots);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const selected = result.days.flatMap((day) => day.slots.map((slot) => slot.recipeId));
      expect(selected[2]).toBe('a');
      expect(selected).toHaveLength(3);
      expect(new Set(selected)).toContain('b');
    }
    expect(result.nodesUsed).toBeGreaterThan(3);
  });

  it('returns infeasible failures with reasons and no partial plan', () => {
    const catalogue = engineCatalogue([engineRecipe('only')]);
    const result = generateWeek(engineProfile(), catalogue, '2026-11-16');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('sem_candidatos');
      expect(result.failingSlots.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty('days');
    }
  });

  it('returns a failure when the fixed node limit is reached', () => {
    const catalogue = engineCatalogue();
    const result = generateWeek(engineProfile(), catalogue, '2026-11-16', 0, 1);
    expect(MAX_SEARCH_NODES).toBe(10000);
    expect(result).toMatchObject({ ok: false, reason: 'limite_de_nos', nodesUsed: 1 });
  });

  it('preserves safe locked slots during week regeneration and rejects unsafe locked slots', () => {
    const catalogue = engineCatalogue();
    const initial = generateWeek(engineProfile(), catalogue, '2026-11-16');
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    const plan = { ...enginePlan(catalogue), days: initial.days };
    plan.days[0]!.slots[0]!.locked = true;
    const lockedId = plan.days[0]!.slots[0]!.recipeId;
    const regenerated = regenerateWeek(plan, catalogue, '2026-11-16', 12);
    expect(regenerated.ok).toBe(true);
    if (regenerated.ok) {
      expect(regenerated.days[0]?.slots[0]).toMatchObject({ recipeId: lockedId, locked: true });
      expect(regenerated.days.flatMap((day) => day.slots).filter((slot) => slot.recipeId !== lockedId).every((slot) => !slot.locked)).toBe(true);
    }

    catalogue.ingredients[0]!.allergens = ['peixe'];
    const unsafe = regenerateWeek({ ...plan, profile: { ...plan.profile, allergens: ['peixe'] } }, catalogue, '2026-11-16');
    expect(unsafe.ok).toBe(false);
    if (!unsafe.ok) expect(unsafe.failingSlots[0]?.reasons).toContain('alergenio');
  });

  it('regenerates one unlocked slot without keeping its current recipe and revalidates swaps', () => {
    const catalogue = engineCatalogue();
    const plan = enginePlan(catalogue);
    const before = plan.days[0]?.slots[0]?.recipeId;
    const result = regenerateSlot(plan, 0, 'almoco', catalogue, '2026-11-16');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.days[0]?.slots[0]?.recipeId).not.toBe(before);
    const alternatives = getSwapCandidates(plan, 0, 'almoco', catalogue, '2026-11-16');
    expect(alternatives.some((recipe) => recipe.id !== before)).toBe(true);
    const swap = swapRecipe(plan, 0, 'almoco', 'not-safe', catalogue, '2026-11-16');
    expect(swap.ok).toBe(false);
    plan.days[0]!.slots[0]!.locked = true;
    expect(swapRecipe(plan, 0, 'almoco', 'b', catalogue, '2026-11-16')).toMatchObject({ ok: false });
  });

  it('is deterministic for 200 seeded input iterations', () => {
    const catalogue = engineCatalogue();
    const random = createSeededRandom(90210);
    for (let iteration = 0; iteration < 200; iteration += 1) {
      const seed = Math.floor(random() * 0xffffffff);
      const profile = engineProfile({ priority: iteration % 2 === 0 ? 'mais_barato' : 'rapido' });
      const first = generateWeek(profile, catalogue, '2026-11-16', seed);
      const second = generateWeek(profile, catalogue, '2026-11-16', seed);
      expect(first).toEqual(second);
      if (first.ok) {
        const ids = first.days.flatMap((day) => day.slots.map((slot) => slot.recipeId));
        expect(ids.every((id) => catalogue.recipes.some((recipe) => recipe.id === id))).toBe(true);
      }
    }
  });
});
