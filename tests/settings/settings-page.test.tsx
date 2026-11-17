import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../../src/components/settings/settings-page';
import { APPLICATION_STORAGE_KEY } from '../../src/lib/state/application-storage';
import { PLAN_STORAGE_KEY } from '../../src/lib/state/plan-storage';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
async function renderSettings(): Promise<HTMLDivElement> {
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root?.render(createElement(SettingsPage)); });
  return host;
}
async function reset(container: HTMLElement): Promise<void> {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === 'Apagar os meus dados');
  if (!button) throw new Error('Reset button missing');
  await act(async () => { button.click(); });
}
afterEach(async () => { if (root) await act(async () => { root?.unmount(); }); root = null; host?.remove(); host = null; window.localStorage.clear(); vi.restoreAllMocks(); });

describe('settings data reset', () => {
  it('keeps local data when reset confirmation is declined', async () => {
    window.localStorage.setItem(PLAN_STORAGE_KEY, '{"saved":true}');
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const screen = await renderSettings();
    await reset(screen);
    expect(window.localStorage.getItem(PLAN_STORAGE_KEY)).toBe('{"saved":true}');
  });

  it('clears local application data only after affirmative confirmation', async () => {
    window.localStorage.setItem(PLAN_STORAGE_KEY, '{"saved":true}');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const screen = await renderSettings();
    await reset(screen);
    expect(window.localStorage.getItem(APPLICATION_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(PLAN_STORAGE_KEY)).toBeNull();
    expect(screen.querySelector('[role="status"]')?.textContent).toContain('foram apagados');
  });
});
