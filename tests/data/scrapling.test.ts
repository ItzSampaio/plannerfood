import { describe, expect, it } from 'vitest';
import { POST } from '../../src/app/api/scrapling/refresh/route';

describe('disabled external pricing boundary', () => {
  it('rejects Scrapling refresh without network access or observations', async () => {
    const response = POST();
    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toMatchObject({ ok: false, code: 'EXTERNAL_PRICING_DISABLED' });
  });
});
