import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SetupWizard } from '../../src/components/wizard/setup-wizard';
import { PlannerDashboard } from '../../src/components/planner/planner-dashboard';
import { WIZARD_DRAFT_KEY } from '../../src/lib/state/wizard-reducer';
import { readApplicationItem } from '../../src/lib/state/application-storage';

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

async function clickInput(container: HTMLElement, selector: string): Promise<void> {
  const input = container.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Could not find input ${selector}.`);
  await act(async () => { input.click(); });
}

async function setInput(container: HTMLElement, selector: string, value: string): Promise<void> {
  const element = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!element) throw new Error(`Could not find input ${selector}.`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

afterEach(async () => {
  if (root) await act(async () => { root?.unmount(); });
  root = null;
  host?.remove();
  host = null;
  window.localStorage.clear();
});

describe('setup wizard interface', () => {
  it('completes the six steps, validates answers, and saves the profile locally', async () => {
    window.localStorage.clear();
    const container = await render(<SetupWizard />);
    await clickButton(container, 'Continuar');
    expect(container.textContent).toContain('Escolha um supermercado para continuar.');

    await clickButton(container, 'Continente');
    await clickButton(container, 'Continuar');
    await clickButton(container, '5 ou mais');
    await setInput(container, '#people-count', '6');
    await clickButton(container, 'Continuar');
    await clickButton(container, 'Jantar');
    await clickButton(container, 'Continuar');
    await clickInput(container, 'input[name="dietary-rule"][value="sem_gluten"]');
    await clickButton(container, 'Continuar');
    await clickButton(container, 'Aipo');
    await setInput(container, '#exclusions', 'cogumelos');
    const waterCheckbox = [...container.querySelectorAll<HTMLInputElement>('.pantry-item input')]
      .find((input) => input.parentElement?.textContent?.includes('Água'));
    if (!waterCheckbox) throw new Error('Could not find the Água pantry option.');
    await act(async () => { waterCheckbox.click(); });
    await clickButton(container, 'Continuar');
    await clickInput(container, 'input[name="priority"][value="rapido"]');
    await setInput(container, '#weekly-budget', '145,50');
    await clickButton(container, 'Rever respostas');

    expect(container.textContent).toContain('Confirme');
    expect(container.textContent).toContain('Aipo');
    expect(container.textContent).toContain('cogumelos');
    expect(container.textContent).toContain('145,50');
    await clickButton(container, 'Guardar');
    expect(container.textContent).toContain('guardadas neste dispositivo.');
    const saved = readApplicationItem(window.localStorage, WIZARD_DRAFT_KEY);
    expect(saved).not.toBeNull();
    expect(saved).toContain('"peopleInput":"6"');
    expect(saved).toContain('"weeklyBudgetInput":"145,50"');
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host?.remove();
    const resumed = await render(<SetupWizard />);
    expect(resumed.textContent).toContain('pronto.');
    const generateLink = resumed.querySelector<HTMLAnchorElement>('a[href="/plan"]');
    expect(generateLink).not.toBeNull();
    expect(generateLink?.textContent).toContain('Gerar o meu plano');
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host?.remove();
    const results = await render(<PlannerDashboard />);
    expect(results.querySelectorAll('.day-card')).toHaveLength(7);
    expect(results.querySelectorAll('.meal-card')).toHaveLength(7);
  });
});
