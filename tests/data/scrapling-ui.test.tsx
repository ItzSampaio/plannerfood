import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductCatalogueManager } from '../../src/components/catalogue/product-catalogue-manager';
import { TESTED_HISTORICAL_OBSERVATIONS } from '../../src/lib/pricing/scrapling';
import { ptPT } from '../../src/i18n/pt-PT';
import { PRODUCT_CATALOGUE_STORAGE_KEY } from '../../src/lib/data/product-catalogue';

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
  const button = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label));
  if (!button) throw new Error(`Could not find button containing ${label}.`);
  await act(async () => { button.click(); });
}

afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = null;
  host?.remove();
  host = null;
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('Scrapling Review Panel UI integration', () => {
  it('renders "Atualizar preços Scrapling" button and opens review panel with safety gating', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        source: 'scrapling_worker',
        products: TESTED_HISTORICAL_OBSERVATIONS,
      }),
    }));

    const container = await render(<ProductCatalogueManager />);

    // 1. Button is present with exact required label
    const refreshBtn = [...container.querySelectorAll('button')].find((el) => el.textContent === 'Atualizar preços Scrapling');
    expect(refreshBtn).toBeDefined();

    // 2. Click button to load Scrapling items
    await act(async () => { refreshBtn?.click(); });

    // 3. Review panel opens
    expect(container.textContent).toContain('Painel de revisão Scrapling');
    expect(container.textContent).toContain('Arroz Agulha Continente');
    expect(container.textContent).toContain('Banana Importada Continente');
    expect(container.textContent).toContain('Pizza Mozzarella Ristorante Dr. Oetker');

    // Check weighted notice for banana
    expect(container.textContent).toContain('Produto pesável');

    // 4. Approval is blocked because safety is unknown
    const cards = container.querySelectorAll('.scrapling-candidate-card');
    expect(cards).toHaveLength(3);

    const firstCard = cards[0] as HTMLElement;
    const approveBtn = [...firstCard.querySelectorAll('button')].find((el) => el.textContent?.includes('Aprovar e importar'));
    expect(approveBtn).toBeDefined();
    expect(approveBtn?.disabled).toBe(true);
    expect(firstCard.textContent).toContain('Aprovação bloqueada');

    // 5. Select confirmed allergens on the first card
    const radioConfirmed = [...firstCard.querySelectorAll('input[type="radio"]')].find((el) => {
      const parent = el.parentElement;
      return parent?.textContent?.includes('Informação de alergénios conferida no rótulo');
    }) as HTMLInputElement | undefined;

    expect(radioConfirmed).toBeDefined();
    await act(async () => { radioConfirmed?.click(); });

    // Approval still blocked because the 4 diets are still 'desconhecido'
    expect(approveBtn?.disabled).toBe(true);

    // 6. Confirm all 4 diets on the first card
    const dietSelects = firstCard.querySelectorAll('.diet-editor-grid select');
    expect(dietSelects).toHaveLength(4);

    for (const select of dietSelects) {
      await act(async () => {
        (select as HTMLSelectElement).value = 'compativel';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    // Now all safety data is confirmed: approval button should be ENABLED
    expect(approveBtn?.disabled).toBe(false);

    // 7. Click approve
    await act(async () => { approveBtn?.click(); });

    // Candidate shows approved
    expect(firstCard.textContent).toContain('Aprovado');

    // Verify stored in localStorage
    const savedJson = window.localStorage.getItem(PRODUCT_CATALOGUE_STORAGE_KEY);
    expect(savedJson).not.toBeNull();
    const saved = JSON.parse(savedJson!);
    const approvedProduct = saved.products.find((p: { name: string }) => p.name === 'Arroz Agulha Continente');
    expect(approvedProduct).toBeDefined();
    expect(approvedProduct.priceState).toBe('observado');
    expect(approvedProduct.price).toBe(1.15);
    expect(approvedProduct.priceObservation?.provider).toBe('scrapling');
    expect(approvedProduct.priceHistory).toHaveLength(1);
  });

  it('handles python unavailable error and allows fallback historical observations', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          error: 'O interpretador Python não está disponível no sistema.',
          code: 'PYTHON_UNAVAILABLE',
          fallbackAvailable: true,
          historicalObservations: TESTED_HISTORICAL_OBSERVATIONS,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          source: 'historical_tested',
          products: TESTED_HISTORICAL_OBSERVATIONS,
        }),
      })
    );

    const container = await render(<ProductCatalogueManager />);

    const refreshBtn = [...container.querySelectorAll('button')].find((el) => el.textContent === 'Atualizar preços Scrapling');
    await act(async () => { refreshBtn?.click(); });

    expect(container.textContent).toContain('O interpretador Python não está disponível no sistema');

    // Click load historical button
    const loadHistoricalBtn = [...container.querySelectorAll('button')].find((el) => el.textContent === 'Carregar observações históricas de teste');
    expect(loadHistoricalBtn).toBeDefined();
    await act(async () => { loadHistoricalBtn?.click(); });

    // Candidates now loaded
    expect(container.textContent).toContain('Arroz Agulha Continente');
  });
});
