import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/lib/catalogue';
import { createWeeklyPlan } from '../../src/lib/planner/create-plan';
import { groupPriceHistory, observationRejectedEvent, productAuditEvents } from '../../src/lib/data/audit';
import {
  applyApplicationBackup, BACKUP_SCHEMA_VERSION, clearApplicationData, createApplicationBackup,
  inspectApplicationBackup, OBSERVATIONS_STORAGE_KEY, PRODUCT_AUDIT_STORAGE_KEY,
  PRODUCT_CATALOGUE_STORAGE_KEY, PLAN_STORAGE_KEY,
} from '../../src/lib/data/application-backup';
import { serializeSavedCatalogue } from '../../src/lib/data/product-catalogue';
import { APPLICATION_STORAGE_KEY, readApplicationItem, writeApplicationItem } from '../../src/lib/state/application-storage';

class MemoryStorage {
  values = new Map<string, string>();
  failKey: string | null = null;
  failed = false;
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (!this.failed && key === this.failKey) { this.failed = true; throw new Error('quota'); }
    this.values.set(key, value);
  }
  removeItem(key: string): void { this.values.delete(key); }
}

function validObservation() {
  return { id: 'obs-1', source: 'manual_import', retailer: 'continente', sourceProductId: null, ean: null, name: 'Registo local', brand: null,
    package: { size: null, unit: null, text: null, fixed: null }, price: { amount: null, currency: null, unitAmount: null, unit: null, promotionalAmount: null, originalAmount: null },
    sourceUrl: null, observedAt: '2026-11-17T12:00:00.000Z', raw: null, retrievalError: null, ingredients: null, allergens: 'unknown', nutrition: null, dietaryCompatibility: null, reviewStatus: 'pending' };
}

describe('application backup and restore', () => {
  it('exports and restores the complete local record set with schema version and timestamp', () => {
    const storage = new MemoryStorage();
    storage.setItem(PRODUCT_CATALOGUE_STORAGE_KEY, serializeSavedCatalogue(catalogue.products));
    storage.setItem(OBSERVATIONS_STORAGE_KEY, JSON.stringify({ version: 1, observations: [validObservation()] }));
    storage.setItem(PRODUCT_AUDIT_STORAGE_KEY, JSON.stringify([{ id: 'event-1', kind: 'product_created' }]));
    const exported = createApplicationBackup(storage, '2026-11-17T13:00:00.000Z');
    expect(JSON.parse(exported)).toMatchObject({ schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt: '2026-11-17T13:00:00.000Z' });
    const destination = new MemoryStorage();
    const preview = inspectApplicationBackup(exported, destination);
    expect(preview.ok).toBe(true);
    expect(applyApplicationBackup(destination, preview, false).ok).toBe(false);
    expect(applyApplicationBackup(destination, preview, true).ok).toBe(true);
    expect(readApplicationItem(destination, OBSERVATIONS_STORAGE_KEY)).toContain('obs-1');
    expect(readApplicationItem(destination, PRODUCT_AUDIT_STORAGE_KEY)).toContain('event-1');
  });

  it('rejects incompatible schema versions and corrupted files without touching storage', () => {
    const storage = new MemoryStorage();
    storage.setItem(PLAN_STORAGE_KEY, '{"kept":true}');
    expect(inspectApplicationBackup('{broken').ok).toBe(false);
    const oldVersion = JSON.stringify({ app: 'smartbasket', schemaVersion: 999, exportedAt: '2026-11-17T12:00:00Z', data: {} });
    expect(inspectApplicationBackup(oldVersion).ok).toBe(false);
    expect(applyApplicationBackup(storage, inspectApplicationBackup('{broken'), true).ok).toBe(false);
    expect(storage.getItem(PLAN_STORAGE_KEY)).toBe('{"kept":true}');
    expect(inspectApplicationBackup(JSON.stringify({ app: 'smartbasket', schemaVersion: 1, exportedAt: '2026-11-17T12:00:00Z', data: {} })).ok).toBe(false);
  });

  it('rejects unknown fields and future schema shapes without partial application', () => {
    const source = new MemoryStorage();
    const good = JSON.parse(createApplicationBackup(source, '2026-11-17T13:00:00Z')) as { data: Record<string, unknown> };
    good.data['smartbasket:unexpected:v1'] = { value: true };
    const current = new MemoryStorage();
    current.setItem(PLAN_STORAGE_KEY, '{"preserved":true}');
    const preview = inspectApplicationBackup(JSON.stringify(good));
    expect(preview.ok).toBe(false);
    expect(applyApplicationBackup(current, preview, true).ok).toBe(false);
    expect(readApplicationItem(current, PLAN_STORAGE_KEY)).toBe('{"preserved":true}');
  });

  it('rejects duplicate product IDs and duplicate observation IDs', () => {
    const storage = new MemoryStorage();
    storage.setItem(PRODUCT_CATALOGUE_STORAGE_KEY, JSON.stringify({ version: 1, products: [...catalogue.products, catalogue.products[0]] }));
    expect(inspectApplicationBackup(createApplicationBackup(storage, '2026-11-17T13:00:00Z')).ok).toBe(false);
    storage.setItem(PRODUCT_CATALOGUE_STORAGE_KEY, serializeSavedCatalogue(catalogue.products));
    storage.setItem(OBSERVATIONS_STORAGE_KEY, JSON.stringify({ version: 1, observations: [validObservation(), validObservation()] }));
    expect(inspectApplicationBackup(createApplicationBackup(storage, '2026-11-17T13:00:00Z')).ok).toBe(false);
  });

  it('previews conflicting stable product IDs rather than silently hiding them', () => {
    const current = new MemoryStorage();
    const source = new MemoryStorage();
    current.setItem(PRODUCT_CATALOGUE_STORAGE_KEY, serializeSavedCatalogue(catalogue.products.map((product, index) => index === 0 ? { ...product, name: 'Nome local mais recente' } : product)));
    source.setItem(PRODUCT_CATALOGUE_STORAGE_KEY, serializeSavedCatalogue(catalogue.products));
    const preview = inspectApplicationBackup(createApplicationBackup(source, '2026-11-17T13:00:00Z'), current);
    expect(preview.ok).toBe(true);
    if (preview.ok) expect(preview.conflicts).toContain(catalogue.products[0]?.id);
  });

  it('accepts a valid saved plan and rejects a plan with a cross-retailer override', () => {
    const profile = { supermarketId: 'continente' as const, people: 2, mealTypes: ['jantar' as const], dietaryRule: 'nenhuma' as const, allergens: [], exclusionText: [], ownedIngredientIds: [], priority: 'rapido' as const, weeklyBudget: 50 };
    const generated = createWeeklyPlan(profile, catalogue, '2026-11-17', 'backup-plan', '2026-11-17T12:00:00.000Z', 7);
    expect(generated.ok).toBe(true);
    if (!generated.ok) throw new Error('Expected a valid plan fixture');
    const storage = new MemoryStorage();
    storage.setItem(PLAN_STORAGE_KEY, JSON.stringify(generated.plan));
    expect(inspectApplicationBackup(createApplicationBackup(storage, '2026-11-17T13:00:00Z')).ok).toBe(true);
    const ingredientId = catalogue.recipes.find((recipe) => generated.plan.days.some((day) => day.slots.some((slot) => slot.recipeId === recipe.id)))?.ingredients[0]?.ingredientId;
    const unsafeProduct = catalogue.products.find((product) => product.supermarketId === 'pingo_doce' && product.ingredientId === ingredientId);
    if (!ingredientId || !unsafeProduct) throw new Error('Expected a cross-retailer product fixture');
    const invalid = { ...generated.plan, productOverrides: { [ingredientId]: unsafeProduct.id } };
    storage.setItem(PLAN_STORAGE_KEY, JSON.stringify(invalid));
    expect(inspectApplicationBackup(createApplicationBackup(storage, '2026-11-17T13:00:00Z')).ok).toBe(false);
  });

  it('rolls back earlier writes if a later storage write fails', () => {
    const storage = new MemoryStorage();
    storage.setItem(PLAN_STORAGE_KEY, '{"original":true}');
    const source = new MemoryStorage();
    source.setItem(OBSERVATIONS_STORAGE_KEY, JSON.stringify({ version: 1, observations: [validObservation()] }));
    const preview = inspectApplicationBackup(createApplicationBackup(source, '2026-11-17T13:00:00Z'));
    storage.failKey = APPLICATION_STORAGE_KEY;
    const result = applyApplicationBackup(storage, preview, true);
    expect(result.ok).toBe(false);
    expect(storage.getItem(PLAN_STORAGE_KEY)).toBe('{"original":true}');
    expect(storage.getItem(OBSERVATIONS_STORAGE_KEY)).toBeNull();
  });

  it('requires explicit confirmation before clearing any app data', () => {
    const storage = new MemoryStorage();
    storage.setItem(PLAN_STORAGE_KEY, '{"kept":true}');
    expect(clearApplicationData(storage, false).ok).toBe(false);
    expect(readApplicationItem(storage, PLAN_STORAGE_KEY)).not.toBeNull();
    expect(clearApplicationData(storage, true).ok).toBe(true);
    expect(readApplicationItem(storage, PLAN_STORAGE_KEY)).toBeNull();
  });

  it('keeps all existing data if the atomic reset write fails', () => {
    const storage = new MemoryStorage();
    storage.setItem(PLAN_STORAGE_KEY, '{"kept":true}');
    storage.failKey = APPLICATION_STORAGE_KEY;
    expect(clearApplicationData(storage, true).ok).toBe(false);
    expect(readApplicationItem(storage, PLAN_STORAGE_KEY)).toBe('{"kept":true}');
  });

  it('lazily reads legacy keys and commits future writes through the unified envelope', () => {
    const storage = new MemoryStorage();
    storage.setItem(PLAN_STORAGE_KEY, '{"legacy":true}');
    expect(readApplicationItem(storage, PLAN_STORAGE_KEY)).toBe('{"legacy":true}');
    writeApplicationItem(storage, PLAN_STORAGE_KEY, '{"current":true}');
    expect(storage.getItem(APPLICATION_STORAGE_KEY)).not.toBeNull();
    expect(storage.getItem(PLAN_STORAGE_KEY)).toBeNull();
    expect(readApplicationItem(storage, PLAN_STORAGE_KEY)).toBe('{"current":true}');
  });

  it('refuses to export a partial copy when the canonical local record is corrupted', () => {
    const storage = new MemoryStorage();
    storage.setItem(APPLICATION_STORAGE_KEY, '{broken');
    storage.setItem(PLAN_STORAGE_KEY, '{"legacy":true}');
    expect(() => createApplicationBackup(storage, '2026-11-17T13:00:00Z')).toThrow();
    expect(storage.getItem(APPLICATION_STORAGE_KEY)).toBe('{broken');
    expect(storage.getItem(PLAN_STORAGE_KEY)).toBe('{"legacy":true}');
  });
});

describe('audit event records', () => {
  it('captures product values before and after changes and does not invent empty events', () => {
    const product = catalogue.products[0];
    if (!product) throw new Error('Expected seed product');
    const before = { ...product } as unknown as Record<string, unknown>;
    const after = { ...product, name: 'Nome atualizado' } as unknown as Record<string, unknown>;
    expect(productAuditEvents([before], [after], '2026-11-17T13:00:00Z', 'Catálogo local')).toMatchObject([{ kind: 'product_updated', before: { name: product.name }, after: { name: 'Nome atualizado' }, productId: product.id }]);
    expect(productAuditEvents([], [], '2026-11-17T13:00:00Z', 'Catálogo local')).toEqual([]);
  });

  it('records an observation rejection with source, ID and before/after state', () => {
    expect(observationRejectedEvent({ id: 'obs-9', source: 'manual_import' }, '2026-11-17T13:00:00Z')).toMatchObject({ kind: 'observation_rejected', observationId: 'obs-9', source: 'manual_import', before: { reviewStatus: 'pending' }, after: { reviewStatus: 'rejected' } });
  });

  it('pairs saved price changes into the accurate original and resulting values', () => {
    const product = catalogue.products[0];
    if (!product) throw new Error('Expected seed product');
    const history = [
      { id: 'before', price: 1.25, priceState: 'manual' as const, recordedAt: '2026-11-17T13:00:00Z', effectiveDate: '2026-11-17', sourceUrl: null, note: 'Valor anterior' },
      { id: 'after', price: 1.50, priceState: 'manual' as const, recordedAt: '2026-11-17T13:00:00Z', effectiveDate: '2026-11-17', sourceUrl: null, note: null },
    ];
    expect(groupPriceHistory({ ...product, priceHistory: history })).toMatchObject([{ before: { price: 1.25 }, after: { price: 1.5 }, recordedAt: '2026-11-17T13:00:00Z' }]);
  });
});
