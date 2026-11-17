import { expect, test } from '@playwright/test';
import { catalogue } from '../src/lib/catalogue';
import { computeBasket } from '../src/lib/calc/basket';
import { createWeeklyPlan } from '../src/lib/planner/create-plan';
import { formatCents } from '../src/lib/money';
import { supermarketLabels } from '../src/i18n/labels';
import type { UserProfile } from '../src/lib/types';

test('user can add an unknown-price local product without asserting unsafe data', async ({ page }) => {
  await page.goto('/catalogo');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Adicionar produto' }).click();
  await page.getByRole('textbox', { name: 'Nome do produto', exact: true }).fill('Produto local para demonstração');
  await page.getByRole('textbox', { name: 'Marca', exact: true }).fill('Marca introduzida pelo utilizador');
  await page.locator('.pack-size-field input').fill('500');
  await page.getByRole('textbox', { name: 'Ligação para o produto', exact: true }).fill('https://example.org/produto');
  await page.getByRole('button', { name: 'Guardar produto' }).click();
  await expect(page.getByText('Produto local para demonstração')).toBeVisible();
  await expect(page.getByText('Marca introduzida pelo utilizador')).toBeVisible();
  await expect(page.getByText('Preço desconhecido').last()).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('smartbasket:product-catalogue:v1') ?? 'null'));
  const product = saved.products.find((item: { name: string }) => item.name === 'Produto local para demonstração');
  expect(product.priceState).toBe('desconhecido');
  expect(product.price).toBeNull();
  expect(product.allergens).toBe('unknown');
  expect(Object.values(product.dietCompatibility).every((value) => value === 'desconhecido')).toBe(true);

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descarregar CSV' }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe('smartbasket-produtos.csv');
});

test('edited catalogue prices flow through product selection and the Phase 2 basket', async ({ page }) => {
  const profile: UserProfile = {
    supermarketId: 'continente', people: 1, mealTypes: ['jantar'], dietaryRule: 'nenhuma', allergens: [],
    exclusionText: [], ownedIngredientIds: [], priority: 'rapido', weeklyBudget: 100,
  };
  const created = createWeeklyPlan(profile, catalogue, '2026-11-16', 'catalogue-integration-plan', '2026-11-16T00:00:00.000Z', 42);
  expect(created.ok).toBe(true);
  if (!created.ok) throw new Error('Could not create a real plan for catalogue integration.');
  const line = computeBasket(created.plan, catalogue, '2026-11-16').lines.find((entry) => !entry.owned && entry.selection.status === 'selected');
  expect(line?.selection.status).toBe('selected');
  if (!line || line.selection.status !== 'selected') throw new Error('The generated plan has no selectable ingredient.');

  await page.goto('/catalogo');
  await page.evaluate((plan) => {
    window.localStorage.clear();
    window.localStorage.setItem('smartbasket:plan:v1', JSON.stringify(plan));
  }, created.plan);
  await page.reload();
  const productCard = page.locator('.catalogue-product-card')
    .filter({ has: page.getByText(line.selection.product.name, { exact: true }) })
    .filter({ hasText: supermarketLabels[line.selection.product.supermarketId] });
  await productCard.getByRole('button', { name: 'Editar' }).click();
  await page.locator('.product-editor .product-form-grid select').selectOption('manual');
  await page.getByRole('textbox', { name: 'Preço da embalagem', exact: true }).fill('0,01');
  await page.locator('input[type="date"]').fill('2026-11-16');
  await page.getByRole('button', { name: 'Guardar produto' }).click();

  await page.goto('/plan');
  await expect(page.locator('.day-card')).toHaveCount(7);
  await page.getByRole('button', { name: 'Lista de compras' }).click();
  const shoppingLine = page.locator('.shopping-item').filter({ hasText: line.selection.product.name });
  await expect(shoppingLine).toContainText('0,01 €');
  await expect(shoppingLine).toContainText(formatCents(line.selection.packs));
});

test('scrapling review panel allows human review, blocks unknown safety, and imports approved observation', async ({ page }) => {
  await page.route('**/api/scrapling/refresh', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        source: 'scrapling_worker',
        products: [
          {
            name: 'Arroz Agulha Continente',
            brand: 'Continente',
            supermarketId: 'continente',
            packSize: 1000,
            unit: 'g',
            price: 1.15,
            unitPrice: { amount: 1.15, unit: 'kg' },
            isWeighted: false,
            productUrl: 'https://www.continente.pt/produto/arroz-agulha-continente-2027209.html',
            retrievedAt: new Date().toISOString(),
            sourceProductId: '2027209',
            suggestedIngredientId: 'arroz',
          },
        ],
      }),
    });
  });

  await page.goto('/catalogo');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.getByRole('button', { name: 'Atualizar preços Scrapling' }).click();
  await expect(page.getByText('Painel de revisão Scrapling')).toBeVisible();
  await expect(page.getByText('Arroz Agulha Continente')).toBeVisible();

  const approveButton = page.getByRole('button', { name: 'Aprovar e importar' });
  await expect(approveButton).toBeDisabled();
  await expect(page.getByText('Aprovação bloqueada')).toBeVisible();

  // Confirm allergens
  await page.getByLabel('Informação de alergénios conferida no rótulo').check();

  // Confirm all 4 diets
  const selects = page.locator('.diet-editor-grid select');
  const count = await selects.count();
  for (let i = 0; i < count; i++) {
    await selects.nth(i).selectOption('compativel');
  }

  // Approval button is now enabled
  await expect(approveButton).toBeEnabled();
  await approveButton.click();

  await expect(page.getByText('Aprovado ✓')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem('smartbasket:product-catalogue:v1') ?? 'null'));
  const product = saved.products.find((item: { name: string }) => item.name === 'Arroz Agulha Continente');
  expect(product.priceState).toBe('observado');
  expect(product.price).toBe(1.15);
  expect(product.priceObservation.provider).toBe('scrapling');
});
