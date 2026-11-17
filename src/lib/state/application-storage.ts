import { PRODUCT_CATALOGUE_STORAGE_KEY } from '../data/product-catalogue';
import { PLAN_STORAGE_KEY } from './plan-storage';
import { WIZARD_DRAFT_KEY } from './wizard-reducer';

export const APPLICATION_STORAGE_KEY = 'smartbasket:application:v1';
export const APPLICATION_DATA_KEYS = [
  PRODUCT_CATALOGUE_STORAGE_KEY, PLAN_STORAGE_KEY, WIZARD_DRAFT_KEY,
  'smartbasket:product-observations:v1', 'smartbasket:observation-audit:v1',
  'smartbasket:product-audit:v1', 'smartbasket:plan-seed:v1',
] as const;

export type ApplicationStorageEnvelope = { version: 1; data: Record<string, string | null> };
export type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }

export function readApplicationStorage(storage: StoragePort): ApplicationStorageEnvelope | null {
  const raw = storage.getItem(APPLICATION_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.data)) return null;
    const data: Record<string, string | null> = {};
    for (const [key, item] of Object.entries(value.data)) {
      if (typeof item !== 'string' && item !== null) return null;
      data[key] = item;
    }
    return { version: 1, data };
  } catch { return null; }
}

export function readApplicationItem(storage: StoragePort, key: (typeof APPLICATION_DATA_KEYS)[number]): string | null {
  const raw = storage.getItem(APPLICATION_STORAGE_KEY);
  if (raw !== null) {
    const envelope = readApplicationStorage(storage);
    return envelope && key in envelope.data ? envelope.data[key] ?? null : null;
  }
  return storage.getItem(key);
}

export function readAllApplicationItems(storage: StoragePort): Record<string, string | null> {
  const raw = storage.getItem(APPLICATION_STORAGE_KEY);
  if (raw !== null) {
    const envelope = readApplicationStorage(storage);
    if (!envelope) throw new Error('The unified application data is corrupted.');
    return Object.fromEntries(APPLICATION_DATA_KEYS.map((key) => [key, envelope.data[key] ?? null]));
  }
  return Object.fromEntries(APPLICATION_DATA_KEYS.map((key) => [key, storage.getItem(key)]));
}

export function writeAllApplicationItems(storage: StoragePort, data: Record<string, string | null>): void {
  const normalized = Object.fromEntries(APPLICATION_DATA_KEYS.map((key) => [key, data[key] ?? null]));
  storage.setItem(APPLICATION_STORAGE_KEY, JSON.stringify({ version: 1, data: normalized } satisfies ApplicationStorageEnvelope));
  for (const key of APPLICATION_DATA_KEYS) {
    try { storage.removeItem(key); } catch { /* The committed envelope takes precedence over legacy copies. */ }
  }
}

export function writeApplicationItem(storage: StoragePort, key: (typeof APPLICATION_DATA_KEYS)[number], value: string): void {
  const data = readAllApplicationItems(storage);
  data[key] = value;
  writeAllApplicationItems(storage, data);
}

export function removeApplicationItem(storage: StoragePort, key: (typeof APPLICATION_DATA_KEYS)[number]): void {
  const data = readAllApplicationItems(storage);
  data[key] = null;
  writeAllApplicationItems(storage, data);
}

export function removeLegacyApplicationItems(storage: StoragePort): void {
  for (const key of APPLICATION_DATA_KEYS) {
    try { storage.removeItem(key); } catch { /* The unified empty envelope prevents legacy records from being read. */ }
  }
}
