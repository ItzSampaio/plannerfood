import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ProductCatalogueManager } from '../../src/components/catalogue/product-catalogue-manager';

describe('catalogue external pricing UI', () => {
  afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

  it('does not render a live refresh control', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ProductCatalogueManager />); });
    expect(host.textContent).not.toContain('Atualizar preços Scrapling');
    expect(host.textContent).not.toContain('Preço em directo');
    root.unmount();
  });
});
