import { describe, expect, it } from 'vitest';
import { catalogue } from '../../src/lib/catalogue';
import { exportProductsCsv, exportProductsJson, parseProductImport, readSavedCatalogue } from '../../src/lib/data/product-catalogue';
import { withPriceHistory } from '../../src/lib/data/price-history';
import { validateProducts } from '../../src/lib/data/validators';
import type { Product } from '../../src/lib/types';

const seedProduct = catalogue.products[0]!;

describe('editable product catalogue files', () => {
  it('round-trips CSV quoting, pt-PT names, unknown prices and safety data', () => {
    const product: Product = {
      ...seedProduct,
      id: 'local-csv-test',
      name: 'Feijão, “bom”',
      brand: 'Marca, S.A.',
      productUrl: 'https://example.org/produto',
      catalogueSource: 'user',
      price: null,
      priceState: 'desconhecido',
      priceUpdatedAt: null,
      estimate: undefined,
      allergens: 'unknown',
    };
    const csv = exportProductsCsv([product]);
    const result = parseProductImport(csv, 'csv', catalogue, false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const imported = result.catalogue.products.find((item) => item.id === product.id);
      expect(imported?.name).toBe(product.name);
      expect(imported?.brand).toBe(product.brand);
      expect(imported?.priceState).toBe('desconhecido');
      expect(imported?.price).toBeNull();
      expect(imported?.allergens).toBe('unknown');
    }
  });

  it('requires explicit confirmation before importing verified prices', () => {
    const verified: Product = {
      ...seedProduct,
      id: 'verified-import-test',
      name: 'Produto conferido pelo utilizador',
      price: 1.29,
      priceState: 'verificado',
      priceUpdatedAt: '2026-10-01',
      productUrl: 'https://example.org/produto',
      catalogueSource: 'user',
    };
    const json = exportProductsJson([verified]);
    const rejected = parseProductImport(json, 'json', catalogue, false);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.errors[0]).toContain('Confirm');

    const accepted = parseProductImport(json, 'json', catalogue, true);
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(accepted.catalogue.products.find((item) => item.id === verified.id)?.priceState).toBe('verificado');
  });

  it('keeps a real zero price distinct from a missing price', () => {
    const free: Product = {
      ...seedProduct,
      id: 'zero-price-import-test',
      name: 'Produto com preço zero',
      price: 0,
      priceState: 'manual',
      priceUpdatedAt: '2026-10-01',
      catalogueSource: 'user',
    };
    const result = parseProductImport(exportProductsJson([free]), 'json', catalogue, false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.catalogue.products.find((item) => item.id === free.id)?.price).toBe(0);

    const missing = parseProductImport(JSON.stringify([{ ...free, price: null }]), 'json', catalogue, false);
    expect(missing.ok).toBe(false);
  });

  it('retains price history in local snapshots and appends changes', () => {
    const previous: Product = {
      ...seedProduct,
      id: 'history-test',
      price: 1.10,
      priceState: 'manual',
      priceUpdatedAt: '2026-10-01',
      priceHistory: [],
    };
    const next: Product = { ...previous, price: 1.25, priceUpdatedAt: '2026-10-05' };
    const updated = withPriceHistory(previous, next, '2026-10-05T12:00:00.000Z', 'Preço conferido pelo utilizador');
    expect(updated.priceHistory).toHaveLength(2);
    expect(updated.priceHistory?.map((entry) => entry.price)).toEqual([1.10, 1.25]);
    const properSnapshot = readSavedCatalogue(exportProductsJson([updated]), catalogue);
    expect(properSnapshot?.products.find((item) => item.id === updated.id)?.priceHistory).toHaveLength(2);
  });

  it('rejects malformed CSV and unknown price states rather than silently normalizing them', () => {
    const malformed = 'id,supermarketId,ingredientId,name,packSize,unit,priceState,price,priceUpdatedAt,allergens,dietCompatibility\n,continente,'
      + `${seedProduct.ingredientId},Produto,1,${seedProduct.unit},surpresa,,,"unknown",{}`;
    const result = parseProductImport(malformed, 'csv', catalogue, false);
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate IDs inside an import batch', () => {
    const duplicate = { ...seedProduct, id: 'duplicate-import', catalogueSource: 'user' as const };
    const result = parseProductImport(JSON.stringify([duplicate, duplicate]), 'json', catalogue, false);
    expect(result.ok).toBe(false);
  });

  it('round-trips selling models, minimum quantities and per-unit conversion data', () => {
    const source = { ...catalogue.products[0]!, id: 'variable-test', sellingModel: 'variable_weight' as const, packSize: 1, minimumQuantity: 600, minimumQuantityUnit: 'g' as const, actualCheckoutQuantity: null };
    const exported = exportProductsJson([source]);
    const imported = parseProductImport(exported, 'json', catalogue, false);
    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.catalogue.products.find((product) => product.id === source.id)).toMatchObject({ sellingModel: 'variable_weight', minimumQuantity: 600, minimumQuantityUnit: 'g' });
  });

  it('rejects barcode aliases assigned to different products at the same retailer', () => {
    const first = catalogue.products.find((product) => product.supermarketId === 'continente');
    const second = catalogue.products.find((product) => product.supermarketId === 'continente' && product.id !== first?.id);
    if (!first || !second) throw new Error('Two Continente seed products required for validator test.');
    const shared = '1234567890123';
    const result = validateProducts([
      { ...first, barcode: shared },
      { ...second, barcodes: [shared] },
    ], catalogue.ingredients);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.code === 'barcode.duplicate' && error.path.endsWith('.barcodes[0]'))).toBe(true);
  });

  it('accepts the same EAN in a product primary field and its aliases', () => {
    const product = catalogue.products.find((item) => item.supermarketId === 'continente');
    if (!product) throw new Error('Continente seed product required for validator test.');
    const result = validateProducts([{ ...product, barcode: '1234567890123', barcodes: ['1234567890123'] }], catalogue.ingredients);
    expect(result.ok).toBe(true);
  });

  it('scopes barcode and external product ID uniqueness to each retailer', () => {
    const first = catalogue.products.find((product) => product.supermarketId === 'continente');
    const second = catalogue.products.find((product) => product.supermarketId === 'continente' && product.id !== first?.id);
    if (!first || !second) throw new Error('Two Continente seed products required for validator test.');
    const shared = { barcode: '1234567890123', externalProductId: 'shared-id' };
    const result = validateProducts([
      { ...first, ...shared },
      { ...second, ...shared, supermarketId: first.supermarketId === 'continente' ? 'pingo_doce' : 'continente' },
    ], catalogue.ingredients);
    expect(result.ok).toBe(true);
  });
});
