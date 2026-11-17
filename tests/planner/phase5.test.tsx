import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlannerDashboard } from '../../src/components/planner/planner-dashboard';
import { PLAN_STORAGE_KEY } from '../../src/lib/state/plan-storage';
import RecipePage from '../../src/app/plan/refeicao/[id]/page';
import { catalogue } from '../../src/lib/catalogue';
import { computeBasket } from '../../src/lib/calc/basket';
import { getBudgetStatus } from '../../src/lib/calc/budget-status';
import { validateRecipeForSlot } from '../../src/lib/engine/generate';
import { createWeeklyPlan } from '../../src/lib/planner/create-plan';
import type { UserProfile } from '../../src/lib/types';
import { WIZARD_DRAFT_KEY } from '../../src/lib/state/wizard-reducer';
import { readApplicationItem } from '../../src/lib/state/application-storage';

const routeParams = vi.hoisted(() => ({ id: '' }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: routeParams.id }) }));

const profile: UserProfile = {
  supermarketId: 'continente', people: 2, mealTypes: ['jantar'], dietaryRule: 'nenhuma', allergens: [],
  exclusionText: [], ownedIngredientIds: [], priority: 'rapido', weeklyBudget: 100,
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });

async function render(element: ReactElement): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(element); });
  return host;
}

async function clickButton(container: HTMLElement, label: string): Promise<void> {
  const button = [...container.querySelectorAll('button')].find((element) => element.textContent?.includes(label));
  if (!button) throw new Error(`Could not find button containing ${label}.`);
  await act(async () => { button.click(); });
}

afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = null;
  host?.remove();
  host = null;
  window.localStorage.clear();
});

describe('Phase 5 real plan and results flow', () => {
  it('generates a safe seven-day plan from the shipped recipe catalogue and the real basket engine', () => {
    const result = createWeeklyPlan(profile, catalogue, '2026-11-16', 'phase5-test', '2026-11-16T12:00:00.000Z', 9);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.days).toHaveLength(7);
    expect(result.plan.days.every((day) => day.slots.length === 1)).toBe(true);
    const usage = new Map<string, number>();
    for (const day of result.plan.days) for (const slot of day.slots) {
      usage.set(slot.recipeId, (usage.get(slot.recipeId) ?? 0) + 1);
      expect(validateRecipeForSlot(slot.recipeId, slot.mealType, profile, catalogue)).toBe(true);
    }
    expect([...usage.values()].every((count) => count <= 2)).toBe(true);

    const basket = computeBasket(result.plan, catalogue, '2026-11-16');
    expect(basket.lines.length).toBeGreaterThan(0);
    expect(basket.lines.every((line) => line.quantity !== null && line.quantity > 0)).toBe(true);
    expect(basket.hasUnknown).toBe(true);
    expect(basket.unknownLines.length).toBeGreaterThan(0);
    expect(getBudgetStatus(basket, 10_000)).toBe('incompleto');
  });

  it('supports all meal types together for each dietary rule and both supermarkets when no allergen is declared', () => {
    const diets = ['nenhuma', 'vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'] as const;
    const markets = ['continente', 'pingo_doce'] as const;
    const mealTypes = ['pequeno_almoco', 'almoco', 'jantar', 'lanche'] as const;
    for (const supermarketId of markets) for (const dietaryRule of diets) {
      const result = createWeeklyPlan({ ...profile, supermarketId, mealTypes: [...mealTypes], dietaryRule }, catalogue, '2026-11-16', `${supermarketId}-${dietaryRule}`, '2026-11-16T12:00:00.000Z', 0);
      expect(result.ok, `${supermarketId} / ${dietaryRule}`).toBe(true);
      if (result.ok) {
        expect(result.plan.days).toHaveLength(7);
        expect(result.plan.days.every((day) => day.slots.length === mealTypes.length)).toBe(true);
      }
    }
  });

  it('loads completed wizard preferences, shows their actual plan and list, persists checks, and recalculates for a new household size', async () => {
    const wizardState = {
      version: 1,
      state: {
        stepIndex: 6,
        completed: true,
        draft: {
          supermarketId: 'continente', peopleChoice: '2', peopleInput: '2', mealTypes: ['jantar'],
          dietaryRule: 'nenhuma', allergens: [], exclusionText: [], ownedIngredientIds: [],
          priority: 'rapido', weeklyBudgetInput: '100',
        },
      },
    };
    window.localStorage.setItem(WIZARD_DRAFT_KEY, JSON.stringify(wizardState));
    const container = await render(<PlannerDashboard />);

    expect(container.textContent).toContain('A sua semana, refeição a refeição.');
    expect(container.querySelectorAll('.day-card')).toHaveLength(7);
    const mealLink = container.querySelector<HTMLAnchorElement>('.meal-card');
    expect(mealLink?.getAttribute('href')).toMatch(/^\/plan\/refeicao\//);
    expect(readApplicationItem(window.localStorage, PLAN_STORAGE_KEY)).not.toBeNull();
    const storedPlan = JSON.parse(readApplicationItem(window.localStorage, PLAN_STORAGE_KEY) ?? 'null') as { days: { slots: { recipeId: string }[] }[] };
    routeParams.id = storedPlan.days[0]?.slots[0]?.recipeId ?? '';
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host?.remove();
    const detail = await render(<RecipePage />);
    expect(detail.querySelector('.recipe-detail-intro h1')?.textContent).toBeTruthy();
    expect(detail.querySelectorAll('.recipe-ingredient-list li').length).toBeGreaterThan(0);
    expect(detail.querySelectorAll('.recipe-steps li').length).toBeGreaterThan(0);
    expect(detail.querySelector('a[href="/plan"]')).not.toBeNull();
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host?.remove();
    routeParams.id = '';
    const results = await render(<PlannerDashboard />);

    await clickButton(results, 'Lista de compras');
    expect(results.textContent).toContain('Preço desconhecido');
    expect(results.textContent).toContain('embalagens');
    const purchase = results.querySelector<HTMLInputElement>('.shopping-check input:not(:disabled)');
    expect(purchase).not.toBeNull();
    await act(async () => { purchase?.click(); });
    expect(readApplicationItem(window.localStorage, PLAN_STORAGE_KEY)).toContain('"purchased"');
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host?.remove();
    const reopenedResults = await render(<PlannerDashboard />);
    await clickButton(reopenedResults, 'Lista de compras');
    expect(reopenedResults.querySelector<HTMLInputElement>('.shopping-check input:checked')).not.toBeNull();

    await clickButton(reopenedResults, 'Orçamento');
    expect(reopenedResults.textContent).toContain('Orçamento incompleto');
    expect(reopenedResults.textContent).toContain('Não é possível determinar o total');
    expect(reopenedResults.textContent).toContain('Produtos sem preço');

    const people = reopenedResults.querySelector<HTMLSelectElement>('select[aria-label="Pessoas"]');
    expect(people).not.toBeNull();
    await act(async () => {
      if (!people) return;
      people.value = '4';
      people.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clickButton(reopenedResults, 'Recalcular plano');
    expect(reopenedResults.textContent).toContain('4 Pessoas');
    const updatedPlan = JSON.parse(readApplicationItem(window.localStorage, PLAN_STORAGE_KEY) ?? 'null') as { profile?: { people?: number } } | null;
    expect(updatedPlan?.profile?.people).toBe(4);
  });
});
