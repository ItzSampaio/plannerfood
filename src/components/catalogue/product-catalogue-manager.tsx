'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { catalogue as seedCatalogue } from '../../lib/catalogue';
import { ALLERGENS, type Allergen, type DietCompatibility, type DietTag, type Product, type PriceHistoryEntry, type PriceState, type SupermarketId } from '../../lib/types';
import { validateCatalogue } from '../../lib/data/validators';
import { initialPriceHistory, withPriceHistory } from '../../lib/data/price-history';
import {
  exportProductsCsv, exportProductsJson, parseProductImport, PRODUCT_CATALOGUE_STORAGE_KEY,
  readSavedCatalogue, serializeSavedCatalogue,
} from '../../lib/data/product-catalogue';
import { allergenLabels, dietTagLabels, priceStateLabels, supermarketLabels, baseUnitLabels } from '../../i18n/labels';
import { ptPT } from '../../i18n/pt-PT';
import { toCents } from '../../lib/money';
import { getCestaProductDetails, lisbonDate, observedProductFromCesta, searchCestaProducts, type CestaCandidate } from '../../lib/pricing/cesta-mcp';

type PriceForm = {
  priceInput: string;
  estimateInput: string;
  estimateLowInput: string;
  estimateHighInput: string;
  verifiedConfirmed: boolean;
};
type Feedback = { kind: 'success' | 'error'; message: string } | null;
type CestaSearch = { productId: string; candidates: CestaCandidate[]; loading: boolean; message?: string };
const SUPERMARKETS: SupermarketId[] = ['continente', 'pingo_doce'];
const DIET_TAGS: DietTag[] = ['vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'];

function formPrice(product: Product): PriceForm {
  return {
    priceInput: product.price === null ? '' : product.price.toFixed(2).replace('.', ','),
    estimateInput: product.estimate?.value.toFixed(2).replace('.', ',') ?? '',
    estimateLowInput: product.estimate?.low?.toFixed(2).replace('.', ',') ?? '',
    estimateHighInput: product.estimate?.high?.toFixed(2).replace('.', ',') ?? '',
    verifiedConfirmed: false,
  };
}

function blankProduct(): Product {
  return {
    id: '', name: '', supermarketId: 'continente', ingredientId: seedCatalogue.ingredients[0]?.id ?? '',
    packSize: 1, unit: seedCatalogue.ingredients[0]?.baseUnit ?? 'un', price: null, priceState: 'desconhecido',
    priceUpdatedAt: null, allergens: 'unknown',
    dietCompatibility: { vegetariana: 'desconhecido', vegana: 'desconhecido', sem_gluten: 'desconhecido', sem_lactose: 'desconhecido' },
    brand: null, productUrl: null, barcode: null, catalogueSource: 'user',
  };
}

function parseMoney(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  try { toCents(amount); return amount; } catch { return null; }
}

function isGeneric(product: Product): boolean {
  return product.catalogueSource === 'generic_seed' || (!product.catalogueSource && !product.brand && !product.productUrl);
}

function currentLisbonDate(): string { return lisbonDate(new Date().toISOString()); }
function isCurrentObservation(product: Product): boolean { return product.priceState === 'observado' && product.priceObservation?.checkedDate === currentLisbonDate(); }

function safeDownload(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function priceHistoryText(entry: PriceHistoryEntry): string {
  const date = entry.effectiveDate ?? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' }).format(new Date(entry.recordedAt));
  const value = entry.price === null ? entry.estimate ? `${entry.estimate.value.toFixed(2)} € (estimativa)` : 'Sem preço' : `${entry.price.toFixed(2)} €`;
  const source = entry.sourceUrl ? ` · ${entry.sourceUrl}` : '';
  return `${date} · ${priceStateLabels[entry.priceState]} · ${value}${source}${entry.note ? ` · ${entry.note}` : ''}`;
}

export function ProductCatalogueManager() {
  const [products, setProducts] = useState<Product[]>(seedCatalogue.products);
  const [ready, setReady] = useState(false);
  const [supermarket, setSupermarket] = useState<SupermarketId | 'todos'>('todos');
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Product | null>(null);
  const [priceForm, setPriceForm] = useState<PriceForm | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [verifiedImportConfirmed, setVerifiedImportConfirmed] = useState(false);
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null);
  const [cestaSearch, setCestaSearch] = useState<CestaSearch | null>(null);

  useEffect(() => {
    try {
      const saved = readSavedCatalogue(window.localStorage.getItem(PRODUCT_CATALOGUE_STORAGE_KEY), seedCatalogue);
      // localStorage is read after hydration to keep server and client markup identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setProducts(saved.products);
    } catch { /* The original catalogue remains available without local storage. */ }
    setReady(true);
  }, []);

  const filteredProducts = useMemo(() => products.filter((product) =>
    (supermarket === 'todos' || product.supermarketId === supermarket)
    && `${product.name} ${product.brand ?? ''} ${product.ingredientId}`.toLocaleLowerCase('pt-PT').includes(query.trim().toLocaleLowerCase('pt-PT')),
  ).sort((left, right) => supermarketLabels[left.supermarketId].localeCompare(supermarketLabels[right.supermarketId]) || left.name.localeCompare(right.name)), [products, query, supermarket]);

  const persistProducts = (nextProducts: Product[]) => {
    const checked = validateCatalogue({ ...seedCatalogue, products: nextProducts });
    if (!checked.ok) {
      setFeedback({ kind: 'error', message: `${ptPT.catalogueValidationError} (${checked.errors.length})` });
      return false;
    }
    try {
      window.localStorage.setItem(PRODUCT_CATALOGUE_STORAGE_KEY, serializeSavedCatalogue(nextProducts));
      setProducts(nextProducts);
      setFeedback({ kind: 'success', message: ptPT.catalogueSaved });
      return true;
    } catch {
      setFeedback({ kind: 'error', message: ptPT.catalogueStorageError });
      return false;
    }
  };

  const beginEdit = (product: Product) => {
    setAdding(false);
    setEditingId(product.id);
    setDraft({ ...product, dietCompatibility: { ...product.dietCompatibility }, allergens: product.allergens === 'unknown' ? 'unknown' : [...product.allergens] });
    setPriceForm(formPrice(product));
    setFeedback(null);
  };

  const beginAdd = () => {
    const product = blankProduct();
    setEditingId(null);
    setAdding(true);
    setDraft(product);
    setPriceForm(formPrice(product));
    setFeedback(null);
  };

  const cancelEdit = () => { setEditingId(null); setAdding(false); setDraft(null); setPriceForm(null); };

  const saveDraft = () => {
    if (!draft || !priceForm) return;
    if (!draft.name.trim()) { setFeedback({ kind: 'error', message: ptPT.productNameRequired }); return; }
    let price: number | null = null;
    let estimate: Product['estimate'];
    let priceUpdatedAt: string | null = null;
    if (draft.priceState === 'manual' || draft.priceState === 'verificado') {
      price = parseMoney(priceForm.priceInput);
      if (price === null) { setFeedback({ kind: 'error', message: ptPT.invalidPrice }); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.priceUpdatedAt ?? '')) { setFeedback({ kind: 'error', message: ptPT.verificationRequired }); return; }
      if (draft.priceState === 'verificado' && !priceForm.verifiedConfirmed) { setFeedback({ kind: 'error', message: ptPT.verificationRequired }); return; }
      priceUpdatedAt = draft.priceUpdatedAt;
    } else if (draft.priceState === 'observado') {
      if (draft.price === null || !draft.priceObservation) { setFeedback({ kind: 'error', message: ptPT.invalidPrice }); return; }
      price = draft.price;
      priceUpdatedAt = draft.priceUpdatedAt;
    } else if (draft.priceState === 'estimativa') {
      const value = parseMoney(priceForm.estimateInput);
      const low = priceForm.estimateLowInput ? parseMoney(priceForm.estimateLowInput) : undefined;
      const high = priceForm.estimateHighInput ? parseMoney(priceForm.estimateHighInput) : undefined;
      if (value === null || low === null || high === null || (low === undefined) !== (high === undefined) || (low !== undefined && high !== undefined && (low > value || value > high))) {
        setFeedback({ kind: 'error', message: ptPT.invalidEstimate }); return;
      }
      estimate = { value, enteredAt: draft.estimate?.enteredAt ?? new Date().toISOString(), ...(low !== undefined && high !== undefined ? { low, high } : {}) };
    }
    const now = new Date().toISOString();
    const next: Product = {
      ...draft,
      id: draft.id || `user-${draft.supermarketId}-${draft.ingredientId}-${Date.now().toString(36)}`,
      name: draft.name.trim(),
      brand: draft.brand?.trim() || null,
      productUrl: draft.productUrl?.trim() || null,
      barcode: draft.barcode?.trim() || null,
      price,
      priceUpdatedAt,
      catalogueSource: draft.catalogueSource ?? 'user',
      ...(estimate ? { estimate } : {}),
      ...(draft.priceObservation ? { priceObservation: draft.priceObservation } : {}),
    };
    if (next.priceState !== 'estimativa') delete next.estimate;
    if (next.priceState !== 'observado') delete next.priceObservation;
    const previous = products.find((product) => product.id === editingId);
    const recorded = previous ? withPriceHistory(previous, next, now, next.priceState === 'verificado' ? 'Conferido pelo utilizador' : null) : { ...next, priceHistory: initialPriceHistory(next, now, next.priceState === 'verificado' ? 'Conferido pelo utilizador' : null) };
    const nextProducts = previous ? products.map((product) => product.id === previous.id ? recorded : product) : [...products, recorded];
    if (persistProducts(nextProducts)) cancelEdit();
  };

  const importProducts = async () => {
    if (!importFile) return;
    const format = importFile.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
    const result = parseProductImport(await importFile.text(), format, { ...seedCatalogue, products }, verifiedImportConfirmed);
    if (!result.ok) { setFeedback({ kind: 'error', message: `${ptPT.catalogueImportError} (${result.errors.length}): ${result.errors[0]}` }); return; }
    if (persistProducts(result.catalogue.products)) { setImportFile(null); setVerifiedImportConfirmed(false); }
  };

  const exportCsv = () => safeDownload('smartbasket-produtos.csv', exportProductsCsv(products), 'text/csv;charset=utf-8');
  const exportJson = () => safeDownload('smartbasket-produtos.json', exportProductsJson(products), 'application/json;charset=utf-8');

  const beginCestaSearch = async (product: Product) => {
    const ingredient = seedCatalogue.ingredients.find((entry) => entry.id === product.ingredientId);
    if (!ingredient) return;
    setCestaSearch({ productId: product.id, candidates: [], loading: true });
    setFeedback(null);
    try {
      const candidates = await searchCestaProducts(ingredient.name, product.supermarketId);
      setCestaSearch({ productId: product.id, candidates, loading: false, ...(candidates.length === 0 ? { message: ptPT.noCestaProducts } : {}) });
    } catch (error) {
      setCestaSearch({ productId: product.id, candidates: [], loading: false, message: error instanceof Error ? error.message : ptPT.catalogueImportError });
    }
  };

  const importCestaCandidate = async (sourceProduct: Product, candidate: CestaCandidate) => {
    const currentSearch = cestaSearch;
    setCestaSearch({ productId: sourceProduct.id, candidates: currentSearch?.candidates ?? [], loading: true });
    try {
      const details = await getCestaProductDetails(candidate);
      const checkedAt = new Date().toISOString();
      const observed = observedProductFromCesta(sourceProduct, candidate, details, checkedAt, lisbonDate(checkedAt));
      const previous = products.find((product) => product.id === observed.id);
      if (previous) {
        observed.allergens = previous.allergens;
        observed.dietCompatibility = previous.dietCompatibility;
        observed.priceHistory = previous.priceHistory;
      }
      const withHistory = previous
        ? withPriceHistory(previous, observed, checkedAt, 'Observação atual da cesta.pt')
        : { ...observed, priceHistory: initialPriceHistory(observed, checkedAt, 'Observação atual da cesta.pt') };
      const nextProducts = previous
        ? products.map((product) => product.id === previous.id ? withHistory : product)
        : [...products, withHistory];
      if (persistProducts(nextProducts)) setCestaSearch(null);
      else setCestaSearch({ productId: sourceProduct.id, candidates: currentSearch?.candidates ?? [], loading: false });
    } catch (error) {
      setCestaSearch({ productId: sourceProduct.id, candidates: currentSearch?.candidates ?? [], loading: false, message: error instanceof Error ? error.message : ptPT.catalogueImportError });
    }
  };

  if (!ready) return <main className="catalogue-shell"><p className="loading-message">{ptPT.loadingCatalogue}</p></main>;
  return <main className="catalogue-shell">
    <header className="results-topbar"><a className="brand" href="/plan"><span className="brand-mark" aria-hidden="true">s</span><span><span className="brand-name">SmartBasket</span><span className="brand-caption">{ptPT.brandLine}</span></span></a><a className="text-link" href="/plan">{ptPT.backToPlan}</a></header>
    <div className="catalogue-content">
      <div className="catalogue-heading"><div className="eyebrow">{ptPT.localNotice}</div><h1>{ptPT.productCatalogueTitle}</h1><p>{ptPT.productCatalogueDescription}</p></div>
      <div className="price-honesty-banner"><strong>{ptPT.productCatalogueNotice}</strong><span>{ptPT.priceNotice} {ptPT.priceCertaintyNote}</span></div>
      <section className="catalogue-toolbar" aria-label={ptPT.productCatalogueTitle}>
        <div className="catalogue-filter"><label htmlFor="catalogue-search">{ptPT.searchProducts}</label><input id="catalogue-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ptPT.searchProductsHint} /></div>
        <label className="catalogue-filter"><span>{ptPT.supermarket}</span><select value={supermarket} onChange={(event) => setSupermarket(event.target.value as SupermarketId | 'todos')}><option value="todos">{ptPT.allSupermarkets}</option>{SUPERMARKETS.map((id) => <option value={id} key={id}>{supermarketLabels[id]}</option>)}</select></label>
        <button className="button button-primary" type="button" onClick={beginAdd}>{ptPT.addProduct}</button>
        <div className="catalogue-export"><button className="button button-secondary" type="button" onClick={exportCsv}>{ptPT.exportCsv}</button><button className="button button-secondary" type="button" onClick={exportJson}>{ptPT.exportJson}</button></div>
      </section>
      {feedback && <p className={`catalogue-feedback ${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
      {adding && draft && priceForm && <ProductEditor draft={draft} priceForm={priceForm} isNew onChange={setDraft} onPriceFormChange={setPriceForm} onSave={saveDraft} onCancel={cancelEdit} />}
      <section className="catalogue-list" aria-label={ptPT.productCatalogueTitle}>
        <div className="catalogue-list-heading"><strong>{filteredProducts.length} {ptPT.products}</strong><span>{ptPT.pricesDoNotChangeSource}</span></div>
        {filteredProducts.map((product) => <article className="catalogue-product-card" key={product.id}>
          {editingId === product.id && draft && priceForm ? <ProductEditor draft={draft} priceForm={priceForm} isNew={false} onChange={setDraft} onPriceFormChange={setPriceForm} onSave={saveDraft} onCancel={cancelEdit} /> : <>
            <div className="catalogue-product-summary"><div className="catalogue-product-icon" aria-hidden="true">{product.supermarketId === 'continente' ? 'C' : 'P'}</div><div className="catalogue-product-title"><div><strong>{product.name}</strong>{isGeneric(product) && <span className="generic-tag">{ptPT.sourceGeneric}</span>}</div><span>{product.brand || ptPT.brandNotProvided} · {supermarketLabels[product.supermarketId]} · {new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(product.packSize)} {baseUnitLabels[product.unit]}</span>{product.barcode && <small>EAN: {product.barcode}</small>}{product.externalProductId && <small>{ptPT.sourceProductId}: {product.externalProductId}</small>}</div><div className="catalogue-price"><strong>{product.priceState === 'manual' || product.priceState === 'verificado' || product.priceState === 'observado' ? `${product.price?.toFixed(2)} €` : product.priceState === 'estimativa' ? `${product.estimate?.value.toFixed(2)} €` : ptPT.unknownPrice}</strong><span>{product.priceState === 'observado' && !isCurrentObservation(product) ? ptPT.staleObservedPrice : priceStateLabels[product.priceState]}{product.priceObservation ? ` · ${product.priceObservation.checkedAt}` : product.priceUpdatedAt ? ` · ${product.priceUpdatedAt}` : ''}</span>{product.unitPrice && <small>{product.unitPrice.amount.toFixed(2)} €/{product.unitPrice.unit}</small>}{product.priceObservation?.promotion && <small>{ptPT.promotionObserved}</small>}{product.availability === 'unavailable' && <small>{ptPT.unavailableAtSource}</small>}</div><div className="catalogue-product-actions"><button className="button button-secondary" type="button" onClick={() => beginEdit(product)}>{ptPT.editProduct}</button><button className="button button-secondary" type="button" onClick={() => void beginCestaSearch(product)}>{ptPT.refreshLivePrice}</button></div></div>
            <div className="catalogue-product-links">{product.productUrl ? <a href={product.productUrl} target="_blank" rel="noreferrer">{ptPT.openProductSource}</a> : <span>{ptPT.noProductSource}</span>}<button type="button" onClick={() => setHistoryOpenId(historyOpenId === product.id ? null : product.id)}>{ptPT.productHistory} ({product.priceHistory?.length ?? 0})</button></div>
            {cestaSearch?.productId === product.id && <div className="cesta-search-panel"><p>{cestaSearch.loading ? ptPT.searchingCesta : ptPT.cestaSourceNotice}</p>{cestaSearch.message && <p role="status">{cestaSearch.message}</p>}{cestaSearch.candidates.map((candidate) => <div className="cesta-candidate" key={`${candidate.supermarketId}-${candidate.sourceProductId}`}><div><strong>{candidate.name}</strong><span>{candidate.packageText} · {candidate.price.toFixed(2)} €{candidate.unitPrice ? ` · ${candidate.unitPrice.amount.toFixed(2)} €/${candidate.unitPrice.unit}` : ''}</span>{candidate.promotion && <small>{ptPT.promotionObserved} ({candidate.promotion.regularPrice.toFixed(2)} € antes)</small>}</div><button className="button button-primary" type="button" disabled={cestaSearch.loading} onClick={() => void importCestaCandidate(product, candidate)}>{ptPT.importCestaProduct}</button></div>)}<p className="source-location-note">{ptPT.onlineAvailabilityOnly}</p></div>}
            {historyOpenId === product.id && <HistoryPanel entries={product.priceHistory ?? []} />}
          </>}
        </article>)}
      </section>
      <section className="catalogue-import-card"><div><h2>{ptPT.importProducts}</h2><p>{ptPT.importProductsHelper}</p></div><label className="file-picker">{ptPT.chooseImportFile}<input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event: ChangeEvent<HTMLInputElement>) => setImportFile(event.target.files?.[0] ?? null)} /></label><label className="import-confirmation"><input type="checkbox" checked={verifiedImportConfirmed} onChange={(event) => setVerifiedImportConfirmed(event.target.checked)} /><span>{ptPT.confirmImportedVerified}</span></label><button className="button button-primary" type="button" disabled={!importFile} onClick={() => void importProducts()}>{ptPT.applyImport}</button></section>
      <p className="results-disclaimer">{ptPT.allergenDisclaimer}</p>
    </div>
  </main>;
}

function ProductEditor({ draft, priceForm, isNew, onChange, onPriceFormChange, onSave, onCancel }: {
  draft: Product; priceForm: PriceForm; isNew: boolean; onChange: (product: Product) => void;
  onPriceFormChange: (value: PriceForm) => void; onSave: () => void; onCancel: () => void;
}) {
  const [showSafety, setShowSafety] = useState(isNew);
  const setPriceState = (priceState: PriceState) => {
    const withoutObservation = { ...draft };
    delete withoutObservation.priceObservation;
    onChange({ ...withoutObservation, priceState, price: null, estimate: priceState === 'estimativa' ? { value: 0, enteredAt: new Date().toISOString() } : undefined, priceUpdatedAt: null });
    onPriceFormChange({ ...priceForm, priceInput: '', estimateInput: '', estimateLowInput: '', estimateHighInput: '', verifiedConfirmed: false });
  };
  const toggleAllergen = (allergen: Allergen) => {
    if (draft.allergens === 'unknown') return;
    const next = draft.allergens.includes(allergen) ? draft.allergens.filter((item) => item !== allergen) : [...draft.allergens, allergen];
    onChange({ ...draft, allergens: next });
  };
  return <div className="product-editor">
    <div className="editor-heading"><div><h2>{isNew ? ptPT.addProduct : ptPT.editProduct}</h2><p>{ptPT.editorSafetyNotice}</p></div><button className="text-link" type="button" onClick={onCancel}>{ptPT.cancelEdit}</button></div>
    <div className="product-form-grid">
      {isNew && <><label>{ptPT.supermarket}<select value={draft.supermarketId} onChange={(event) => onChange({ ...draft, supermarketId: event.target.value as SupermarketId })}>{SUPERMARKETS.map((market) => <option value={market} key={market}>{supermarketLabels[market]}</option>)}</select></label><label>{ptPT.matchIngredient}<select value={draft.ingredientId} onChange={(event) => { const ingredient = seedCatalogue.ingredients.find((item) => item.id === event.target.value); if (ingredient) onChange({ ...draft, ingredientId: ingredient.id, unit: ingredient.baseUnit }); }}>{seedCatalogue.ingredients.map((ingredient) => <option value={ingredient.id} key={ingredient.id}>{ingredient.name}</option>)}</select></label></>}
      <label>{ptPT.productName}<input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} autoComplete="off" /></label>
      <label>{ptPT.brand}<input value={draft.brand ?? ''} onChange={(event) => onChange({ ...draft, brand: event.target.value || null })} autoComplete="off" /></label>
      <label>{ptPT.packSize}<span className="pack-size-field"><input type="number" min="0.001" step="any" value={draft.packSize} onChange={(event) => onChange({ ...draft, packSize: Number(event.target.value) })} /><span>{baseUnitLabels[draft.unit]}</span></span></label>
      <label>{ptPT.productUrl}<input type="url" value={draft.productUrl ?? ''} onChange={(event) => onChange({ ...draft, productUrl: event.target.value || null })} placeholder="https://…" /></label>
      <label>{ptPT.barcode}<input inputMode="numeric" value={draft.barcode ?? ''} onChange={(event) => onChange({ ...draft, barcode: event.target.value || null })} /></label>
      <label>{ptPT.priceState}<select value={draft.priceState} onChange={(event) => setPriceState(event.target.value as PriceState)}>{draft.priceState === 'observado' && <option value="observado" disabled>{priceStateLabels.observado}</option>}<option value="desconhecido">{ptPT.unknownPriceOption}</option><option value="manual">{ptPT.manualPriceOption}</option><option value="verificado">{ptPT.verifiedPriceOption}</option><option value="estimativa">{ptPT.estimatePriceOption}</option></select></label>
      {(draft.priceState === 'manual' || draft.priceState === 'verificado') && <><label>{ptPT.price}<input inputMode="decimal" value={priceForm.priceInput} onChange={(event) => onPriceFormChange({ ...priceForm, priceInput: event.target.value })} placeholder="0,00" /></label><label>{ptPT.verificationDate}<input type="date" value={draft.priceUpdatedAt ?? ''} onChange={(event) => onChange({ ...draft, priceUpdatedAt: event.target.value || null })} /></label></>}
      {draft.priceState === 'observado' && <><label>{ptPT.price}<input value={priceForm.priceInput} readOnly /></label><label>{ptPT.liveSourceChecked}<input value={draft.priceObservation?.checkedAt ?? ''} readOnly /></label></>}
      {draft.priceState === 'estimativa' && <><label>{ptPT.estimateValue}<input inputMode="decimal" value={priceForm.estimateInput} onChange={(event) => onPriceFormChange({ ...priceForm, estimateInput: event.target.value })} placeholder="0,00" /></label><label>{ptPT.estimateLow}<input inputMode="decimal" value={priceForm.estimateLowInput} onChange={(event) => onPriceFormChange({ ...priceForm, estimateLowInput: event.target.value })} /></label><label>{ptPT.estimateHigh}<input inputMode="decimal" value={priceForm.estimateHighInput} onChange={(event) => onPriceFormChange({ ...priceForm, estimateHighInput: event.target.value })} /></label></>}
    </div>
    {draft.priceState === 'verificado' && <label className="import-confirmation"><input type="checkbox" checked={priceForm.verifiedConfirmed} onChange={(event) => onPriceFormChange({ ...priceForm, verifiedConfirmed: event.target.checked })} /><span>{ptPT.verifyConfirmation}</span></label>}
    <button className="safety-toggle" type="button" aria-expanded={showSafety} onClick={() => setShowSafety((open) => !open)}>{ptPT.safetyData} {showSafety ? '−' : '+'}</button>
    {showSafety && <div className="safety-editor">
      <fieldset><legend>{ptPT.allergensProduct}</legend><label className="checkbox-choice"><input type="radio" name={`allergens-${draft.id || 'new'}`} checked={draft.allergens === 'unknown'} onChange={() => onChange({ ...draft, allergens: 'unknown' })} />{ptPT.unknownAllergensOption}</label><label className="checkbox-choice"><input type="radio" name={`allergens-${draft.id || 'new'}`} checked={draft.allergens !== 'unknown'} onChange={() => onChange({ ...draft, allergens: draft.allergens === 'unknown' ? [] : draft.allergens })} />Informação conferida no rótulo</label>{draft.allergens !== 'unknown' && <div className="allergen-grid">{ALLERGENS.map((allergen) => <label className="allergen-checkbox" key={allergen}><input type="checkbox" checked={draft.allergens !== 'unknown' && draft.allergens.includes(allergen)} onChange={() => toggleAllergen(allergen)} />{allergenLabels[allergen]}</label>)}</div>}</fieldset>
      <fieldset><legend>{ptPT.dietProduct}</legend><div className="diet-editor-grid">{DIET_TAGS.map((tag) => <label key={tag}>{dietTagLabels[tag]}<select value={draft.dietCompatibility[tag]} onChange={(event) => onChange({ ...draft, dietCompatibility: { ...draft.dietCompatibility, [tag]: event.target.value as DietCompatibility[DietTag] } })}><option value="desconhecido">{ptPT.dietStatusUnknown}</option><option value="compativel">{ptPT.dietStatusCompatible}</option><option value="incompativel">{ptPT.dietStatusIncompatible}</option></select></label>)}</div><small>{ptPT.dietDataNotice}</small></fieldset>
    </div>}
    <div className="editor-actions"><button className="button button-secondary" type="button" onClick={onCancel}>{ptPT.cancelEdit}</button><button className="button button-primary" type="button" onClick={onSave}>{ptPT.saveProduct}</button></div>
  </div>;
}

function HistoryPanel({ entries }: { entries: PriceHistoryEntry[] }) {
  if (!entries.length) return <p className="history-empty">{ptPT.noPriceHistory}</p>;
  return <ol className="price-history-list">{[...entries].reverse().map((entry) => <li key={entry.id}>{priceHistoryText(entry)}</li>)}</ol>;
}
