import { expect, test } from '@playwright/test';
import { catalogue } from '../src/lib/catalogue';
import { validateRecipeForSlot } from '../src/lib/engine/generate';
import { createWeeklyPlan } from '../src/lib/planner/create-plan';
import type { Plan } from '../src/lib/types';

test('setup generates a safe real week, recipe pages, shopping list and honest budget', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  const stale = createWeeklyPlan({
    supermarketId: 'pingo_doce', people: 1, mealTypes: ['jantar'], dietaryRule: 'nenhuma', allergens: [],
    exclusionText: [], ownedIngredientIds: [], priority: 'rapido', weeklyBudget: 50,
  }, catalogue, '2026-11-16', 'previous-plan', '2026-11-16T00:00:00.000Z');
  expect(stale.ok).toBe(true);
  if (!stale.ok) throw new Error('Could not create the previous real plan fixture.');
  await page.evaluate((plan) => window.localStorage.setItem('smartbasket:plan:v1', JSON.stringify(plan)), stale.plan);
  await page.reload();

  await page.getByRole('button', { name: /Continente/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('.people-choice').filter({ hasText: /^2$/ }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('.meal-choice').filter({ hasText: 'Jantar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('input[name="dietary-rule"][value="sem_gluten"]').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Aipo' }).click();
  await page.locator('.pantry-item').filter({ hasText: 'Água' }).locator('input').check();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.locator('input[name="priority"][value="rapido"]').check();
  await page.locator('#weekly-budget').fill('145,50');
  await page.getByRole('button', { name: 'Rever respostas' }).click();
  await page.getByRole('button', { name: 'Guardar preferências' }).click();

  await page.getByRole('link', { name: 'Gerar o meu plano' }).click();
  await expect(page.getByRole('heading', { name: 'A sua semana, refeição a refeição.' })).toBeVisible();
  await expect(page.locator('.day-card')).toHaveCount(7);
  await expect(page.locator('.meal-card')).toHaveCount(7);
  const generatedPlan = await page.evaluate(() => JSON.parse(window.localStorage.getItem('smartbasket:plan:v1') ?? 'null')) as Plan;
  const profile = generatedPlan.profile;
  expect(profile.allergens).toContain('aipo');
  expect(profile.dietaryRule).toBe('sem_gluten');
  expect(profile.ownedIngredientIds).toContain('agua');
  const useCounts = new Map<string, number>();
  for (const day of generatedPlan.days) for (const slot of day.slots) {
    useCounts.set(slot.recipeId, (useCounts.get(slot.recipeId) ?? 0) + 1);
    expect(validateRecipeForSlot(slot.recipeId, slot.mealType, profile, catalogue)).toBe(true);
  }
  expect([...useCounts.values()].every((count) => count <= 2)).toBe(true);

  await page.locator('.meal-card').first().click();
  await expect(page.locator('.recipe-detail-intro h1')).toBeVisible();
  await expect(page.locator('.recipe-ingredient-list li').first()).toBeVisible();
  await expect(page.locator('.recipe-steps li').first()).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao plano' }).first().click();
  await expect(page.locator('.day-card')).toHaveCount(7);

  await page.getByRole('button', { name: 'Lista de compras' }).click();
  await expect(page.getByText(/produtos são entradas genéricas/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Já tem em casa' })).toBeVisible();
  await expect(page.getByText('Preço desconhecido').first()).toBeVisible();
  await expect(page.getByText(/embalagens/).first()).toBeVisible();
  const purchase = page.locator('.shopping-check input:not(:disabled)').first();
  await purchase.check();
  await page.reload();
  await page.getByRole('button', { name: 'Lista de compras' }).click();
  await expect(page.locator('.shopping-check input:checked').first()).toBeVisible();

  await page.getByRole('button', { name: 'Orçamento' }).first().click();
  await expect(page.getByText('Orçamento incompleto').first()).toBeVisible();
  await expect(page.getByText('Não é possível determinar o total: há produtos sem preço.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Produtos sem preço' })).toBeVisible();
  await expect(page.getByText(/estimativas/).first()).toBeVisible();

  await page.getByLabel('Pessoas').selectOption('4');
  await page.getByRole('button', { name: 'Recalcular plano' }).click();
  await expect(page.getByText('4 Pessoas', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Planeamento' }).click();
  await expect(page.locator('.day-card')).toHaveCount(7);
});
