import { ALLERGENS, type Product } from '../types';
import { catalogue as seedCatalogue } from '../catalogue';
import { parseObservationImport, type RawObservation } from './observations';
import { readSavedCatalogue, PRODUCT_CATALOGUE_STORAGE_KEY } from './product-catalogue';
import { validateCatalogue } from './validators';
import { PLAN_STORAGE_KEY } from '../state/plan-storage';
import { parseWizardSnapshot, WIZARD_DRAFT_KEY } from '../state/wizard-reducer';
import { readSavedPlan } from '../state/plan-storage';
import { APPLICATION_DATA_KEYS, APPLICATION_STORAGE_KEY, readApplicationItem, readApplicationStorage, writeAllApplicationItems } from '../state/application-storage';

export { PLAN_STORAGE_KEY, PRODUCT_CATALOGUE_STORAGE_KEY };

export const OBSERVATIONS_STORAGE_KEY = 'smartbasket:product-observations:v1';
export const OBSERVATION_AUDIT_STORAGE_KEY = 'smartbasket:observation-audit:v1';
export const PRODUCT_AUDIT_STORAGE_KEY = 'smartbasket:product-audit:v1';
export const PLAN_SEED_STORAGE_KEY = 'smartbasket:plan-seed:v1';
export const BACKUP_SCHEMA_VERSION = 1;

export const BACKUP_KEYS = APPLICATION_DATA_KEYS;

export type ApplicationBackup = {
  app: 'smartbasket';
  schemaVersion: number;
  exportedAt: string;
  data: Partial<Record<(typeof BACKUP_KEYS)[number], unknown>>;
};
export type BackupPreview = { ok: true; backup: ApplicationBackup; counts: Record<string, number>; conflicts: string[] } | { ok: false; errors: string[] };
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function parseStored(raw: string | null): unknown { return raw === null ? undefined : JSON.parse(raw) as unknown; }

export function createApplicationBackup(storage: StorageLike, exportedAt: string): string {
  if (storage.getItem(APPLICATION_STORAGE_KEY) !== null && !readApplicationStorage(storage)) throw new Error('Os dados locais unificados estão corrompidos; não foi criada uma cópia incompleta.');
  const data: ApplicationBackup['data'] = {};
  for (const key of BACKUP_KEYS) {
    const raw = readApplicationItem(storage, key);
    data[key] = raw === null ? null : parseStored(raw);
  }
  return JSON.stringify({ app: 'smartbasket', schemaVersion: BACKUP_SCHEMA_VERSION, exportedAt, data } satisfies ApplicationBackup, null, 2);
}

function validAudit(value: unknown): boolean {
  if (!Array.isArray(value) || !value.every(record)) return false;
  const identifiers = value.map((entry) => typeof entry.id === 'string' ? entry.id : typeof entry.observationId === 'string' && typeof entry.approvedAt === 'string' ? `${entry.observationId}:${entry.approvedAt}` : null).filter((id): id is string => id !== null);
  return new Set(identifiers).size === identifiers.length;
}

function validObservationRecords(value: unknown): boolean {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.observations)) return false;
  return value.observations.every((item) => {
    if (!record(item) || typeof item.id !== 'string' || !item.id.trim() || typeof item.observedAt !== 'string' || !Number.isFinite(Date.parse(item.observedAt))) return false;
    if (!['scrapling', 'open_food_facts', 'open_prices', 'manual_import'].includes(String(item.source))) return false;
    if (item.retailer !== null && item.retailer !== 'continente' && item.retailer !== 'pingo_doce') return false;
    if (item.ean !== null && (typeof item.ean !== 'string' || !/^\d{8,14}$/.test(item.ean))) return false;
    if (item.allergens !== 'unknown' && (!Array.isArray(item.allergens) || !item.allergens.every((allergen) => ALLERGENS.includes(allergen)))) return false;
    if (!['pending', 'approved', 'rejected'].includes(String(item.reviewStatus))) return false;
    if (!record(item.package) || !record(item.price)) return false;
    const price = item.price;
    if (price.amount !== null && (typeof price.amount !== 'number' || !Number.isFinite(price.amount) || price.amount < 0 || Math.round(price.amount * 100) !== price.amount * 100)) return false;
    return true;
  });
}

export function inspectApplicationBackup(text: string, currentStorage?: StorageLike): BackupPreview {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!record(parsed) || parsed.app !== 'smartbasket' || parsed.schemaVersion !== BACKUP_SCHEMA_VERSION || typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt)) || !record(parsed.data)) {
      return { ok: false, errors: ['O ficheiro não é uma cópia SmartBasket compatível com esta versão.'] };
    }
    const data = parsed.data;
    if (Object.keys(data).some((key) => !(BACKUP_KEYS as readonly string[]).includes(key)) || BACKUP_KEYS.some((key) => !(key in data))) return { ok: false, errors: ['A cópia não contém todas as secções esperadas. Os dados atuais não foram alterados.'] };
    const errors: string[] = [];
    let products: Product[] | undefined;
    if (data[PRODUCT_CATALOGUE_STORAGE_KEY] !== undefined && data[PRODUCT_CATALOGUE_STORAGE_KEY] !== null) {
      const saved = data[PRODUCT_CATALOGUE_STORAGE_KEY];
      if (!record(saved) || saved.version !== 1 || !Array.isArray(saved.products)) errors.push('O catálogo guardado tem um formato inválido.');
      else {
        const loaded = readSavedCatalogue(JSON.stringify(saved), seedCatalogue);
        if (!loaded) errors.push('O catálogo contém dados inválidos ou incompatíveis.');
        else {
          products = loaded.products;
          const result = validateCatalogue(loaded);
          if (!result.ok) errors.push('O catálogo não passou a validação de segurança e integridade.');
        }
      }
    }
    let observations: RawObservation[] | undefined;
    if (data[OBSERVATIONS_STORAGE_KEY] !== undefined && data[OBSERVATIONS_STORAGE_KEY] !== null) {
      const saved = data[OBSERVATIONS_STORAGE_KEY];
      if (!validObservationRecords(saved)) errors.push('As observações guardadas têm campos inválidos ou uma versão incompatível.');
      else {
        const result = parseObservationImport(saved);
        if (!result.ok) errors.push(...result.errors);
        else {
          observations = result.observations;
          if (new Set(observations.map((item) => item.id)).size !== observations.length) errors.push('Existem IDs de observação duplicados.');
        }
      }
    }
    for (const key of [OBSERVATION_AUDIT_STORAGE_KEY, PRODUCT_AUDIT_STORAGE_KEY] as const) {
      if (data[key] !== undefined && data[key] !== null && !validAudit(data[key])) errors.push('O histórico de auditoria tem um formato inválido.');
    }
    if (data[WIZARD_DRAFT_KEY] !== undefined && data[WIZARD_DRAFT_KEY] !== null && !parseWizardSnapshot(JSON.stringify(data[WIZARD_DRAFT_KEY]))) errors.push('As preferências guardadas são inválidas.');
    if (data[PLAN_STORAGE_KEY] !== undefined && data[PLAN_STORAGE_KEY] !== null) {
      const activeCatalogue = data[PRODUCT_CATALOGUE_STORAGE_KEY] === undefined || data[PRODUCT_CATALOGUE_STORAGE_KEY] === null
        ? seedCatalogue
        : readSavedCatalogue(JSON.stringify(data[PRODUCT_CATALOGUE_STORAGE_KEY]), seedCatalogue);
      if (!activeCatalogue || !readSavedPlan(JSON.stringify(data[PLAN_STORAGE_KEY]), activeCatalogue)) errors.push('O plano guardado é inválido ou já não cumpre as regras de segurança atuais.');
    }
    if (data[PLAN_SEED_STORAGE_KEY] !== undefined && data[PLAN_SEED_STORAGE_KEY] !== null && (typeof data[PLAN_SEED_STORAGE_KEY] !== 'string' || !Number.isSafeInteger(Number(data[PLAN_SEED_STORAGE_KEY])) || Number(data[PLAN_SEED_STORAGE_KEY]) < 0)) errors.push('O estado de geração do plano é inválido.');
    if (errors.length) return { ok: false, errors };

    const counts: Record<string, number> = {
      produtos: products?.length ?? 0,
      observações: observations?.length ?? 0,
      aprovações: Array.isArray(data[OBSERVATION_AUDIT_STORAGE_KEY]) ? data[OBSERVATION_AUDIT_STORAGE_KEY].length : 0,
      alterações: Array.isArray(data[PRODUCT_AUDIT_STORAGE_KEY]) ? data[PRODUCT_AUDIT_STORAGE_KEY].length : 0,
      planos: data[PLAN_STORAGE_KEY] === undefined || data[PLAN_STORAGE_KEY] === null ? 0 : 1,
      preferências: data[WIZARD_DRAFT_KEY] === undefined || data[WIZARD_DRAFT_KEY] === null ? 0 : 1,
    };
    const conflicts: string[] = [];
    if (currentStorage && data[PRODUCT_CATALOGUE_STORAGE_KEY] !== undefined && data[PRODUCT_CATALOGUE_STORAGE_KEY] !== null) {
      const current = readSavedCatalogue(readApplicationItem(currentStorage, PRODUCT_CATALOGUE_STORAGE_KEY), seedCatalogue);
      if (current && products) {
        const currentById = new Map(current.products.map((product) => [product.id, JSON.stringify(product)]));
        for (const product of products) if (currentById.has(product.id) && currentById.get(product.id) !== JSON.stringify(product)) conflicts.push(product.id);
      }
    }
    return { ok: true, backup: parsed as unknown as ApplicationBackup, counts, conflicts };
  } catch {
    return { ok: false, errors: ['O ficheiro está corrompido ou não contém JSON válido. Os dados atuais não foram alterados.'] };
  }
}

export function applyApplicationBackup(storage: StorageLike, preview: BackupPreview, confirmed: boolean): { ok: true } | { ok: false; error: string } {
  if (!confirmed) return { ok: false, error: 'Confirme explicitamente a reposição antes de continuar.' };
  if (!preview.ok) return { ok: false, error: 'A cópia não passou a validação; os dados atuais foram preservados.' };
  const rechecked = inspectApplicationBackup(JSON.stringify(preview.backup));
  if (!rechecked.ok) return { ok: false, error: 'A cópia deixou de passar a validação; os dados atuais foram preservados.' };
  try {
    const nextData: Record<string, string | null> = {};
    for (const key of BACKUP_KEYS) {
      const value = rechecked.backup.data[key];
      nextData[key] = value === undefined || value === null ? null : JSON.stringify(value);
    }
    writeAllApplicationItems(storage, nextData);
    return { ok: true };
  } catch {
    return { ok: false, error: 'A reposição falhou. O armazenamento local manteve a versão anterior.' };
  }
}

export function clearApplicationData(storage: StorageLike, confirmed: boolean): { ok: boolean } {
  if (!confirmed) return { ok: false };
  try {
    writeAllApplicationItems(storage, Object.fromEntries(BACKUP_KEYS.map((key) => [key, null])));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

