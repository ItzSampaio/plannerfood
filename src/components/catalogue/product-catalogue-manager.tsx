'use client';

import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { catalogue as seedCatalogue } from '../../lib/catalogue';
import { ALLERGENS, type Allergen, type AllergenInfo, type BaseUnit, type DietCompatibility, type DietStatus, type DietTag, type Product, type PriceHistoryEntry, type PriceState, type SupermarketId } from '../../lib/types';
import { validateCatalogue } from '../../lib/data/validators';
import { initialPriceHistory, withPriceHistory } from '../../lib/data/price-history';
import {
  exportProductsCsv, exportProductsJson, parseProductImport, PRODUCT_CATALOGUE_STORAGE_KEY,
  readSavedCatalogue, serializeSavedCatalogue,
} from '../../lib/data/product-catalogue';
import { allergenLabels, categoryLabels, dietTagLabels, priceStateLabels, supermarketLabels, baseUnitLabels } from '../../i18n/labels';
import { ptPT } from '../../i18n/pt-PT';
import { toCents } from '../../lib/money';
import { getCestaProductDetails, lisbonDate, observedProductFromCesta, searchCestaProducts, type CestaCandidate } from '../../lib/pricing/cesta-mcp';
import { parseObservationImport, suggestObservationMatches, type RawObservation } from '../../lib/data/observations';
import { observationFromScraplingCollector } from '../../lib/data/source-adapters';
import { approveObservation, type ApprovalAction, type ObservationReview } from '../../lib/data/observation-approval';

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
const OBSERVATIONS_STORAGE_KEY = 'smartbasket:product-observations:v1';
const OBSERVATION_AUDIT_STORAGE_KEY = 'smartbasket:observation-audit:v1';

type ScraplingCandidateReview = {
  id: string;
  name: string;
  brand: string | null;
  supermarketId: SupermarketId;
  packSize: number;
  unit: BaseUnit;
  price: number;
  unitPrice?: { amount: number; unit: 'kg' | 'l' | 'un' };
  isWeighted?: boolean;
  productUrl: string;
  retrievedAt: string;
  sourceProductId: string;
  ingredientId: string;
  allergens: AllergenInfo;
  dietCompatibility: DietCompatibility;
  weightedNote?: string;
  approved?: boolean;
};

type ScraplingReviewState = {
  loading: boolean;
  error?: string;
  fallbackAvailable?: boolean;
  candidates: ScraplingCandidateReview[];
};

function isCandidateSafetyConfirmed(c: ScraplingCandidateReview): boolean {
  if (c.allergens === 'unknown') return false;
  for (const tag of DIET_TAGS) {
    if (c.dietCompatibility[tag] === 'desconhecido') return false;
  }
  return true;
}

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

function observationSourceLabel(source: RawObservation['source']): string {
  switch (source) {
    case 'scrapling': return 'Scrapling';
    case 'open_food_facts': return 'Open Food Facts';
    case 'open_prices': return 'Open Prices';
    case 'manual_import': return 'Importação manual';
  }
}

function sellingModelLabel(model: Product['sellingModel'] | undefined): string {
  if (model === 'variable_weight') return 'Vendível a peso/volume';
  if (model === 'per_unit') return 'Por unidade';
  return 'Embalagem fixa';
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
  const [scraplingReview, setScraplingReview] = useState<ScraplingReviewState | null>(null);
  const [cestaSearch, setCestaSearch] = useState<CestaSearch | null>(null);
  const [observations, setObservations] = useState<RawObservation[]>([]);
  const [observationFile, setObservationFile] = useState<File | null>(null);
  const [approval, setApproval] = useState<{ id: string; action: ApprovalAction; targetProductId?: string } | null>(null);
  const [approvalIngredient, setApprovalIngredient] = useState(seedCatalogue.ingredients[0]?.id ?? '');
  const [approvalPackageSize, setApprovalPackageSize] = useState('');
  const [approvalUnit, setApprovalUnit] = useState<BaseUnit>('g');
  const [approvalChecks, setApprovalChecks] = useState({ identity: false, package: false, allergens: false, diet: false });

  useEffect(() => {
    try {
      const saved = readSavedCatalogue(window.localStorage.getItem(PRODUCT_CATALOGUE_STORAGE_KEY), seedCatalogue);
      // localStorage is read after hydration to keep server and client markup identical.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setProducts(saved.products);
      const savedObservations = window.localStorage.getItem(OBSERVATIONS_STORAGE_KEY);
      if (savedObservations) {
        const parsed = parseObservationImport(JSON.parse(savedObservations));
        if (parsed.ok) setObservations(parsed.observations);
      }
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

  const persistObservations = (next: RawObservation[]) => {
    setObservations(next);
    window.localStorage.setItem(OBSERVATIONS_STORAGE_KEY, JSON.stringify({ version: 1, observations: next }));
  };

  const importObservations = async () => {
    if (!observationFile) return;
    try {
      const input: unknown = JSON.parse(await observationFile.text());
      let parsed = parseObservationImport(input);
      if (!parsed.ok && Array.isArray(input)) {
        const collectorRecords = input.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item));
        if (collectorRecords.length === input.length) parsed = parseObservationImport({ observations: collectorRecords.map(observationFromScraplingCollector) });
      }
      if (!parsed.ok) { setFeedback({ kind: 'error', message: parsed.errors[0] ?? 'Não foi possível ler as observações.' }); return; }
      const byId = new Map(observations.map((observation) => [observation.id, observation]));
      parsed.observations.forEach((observation) => byId.set(observation.id, observation));
      persistObservations([...byId.values()]);
      setObservationFile(null);
      setFeedback({ kind: 'success', message: 'Observações importadas para revisão. Nenhum produto foi aprovado.' });
    } catch { setFeedback({ kind: 'error', message: 'O ficheiro de observações não contém JSON válido.' }); }
  };

  const rejectObservation = (id: string) => persistObservations(observations.map((observation) => observation.id === id ? { ...observation, reviewStatus: 'rejected' } : observation));

  const approveImportedObservation = () => {
    if (!approval) return;
    const observation = observations.find((item) => item.id === approval.id);
    const packageSize = Number(approvalPackageSize);
    if (!observation || !Number.isFinite(packageSize) || packageSize <= 0) { setFeedback({ kind: 'error', message: 'Confirme um tamanho de embalagem positivo antes de aprovar.' }); return; }
    const review: ObservationReview = { action: approval.action, targetProductId: approval.targetProductId, ingredientId: approvalIngredient, packageSize, packageUnit: approvalUnit, confirmIdentity: approvalChecks.identity, confirmPackage: approvalChecks.package, confirmAllergens: approvalChecks.allergens, confirmDiet: approvalChecks.diet, fields: ['name', 'brand', 'barcode', 'package', 'price', 'source'], approvedAt: new Date().toISOString() };
    const result = approveObservation({ ...seedCatalogue, products }, observation, review);
    if (!result.ok) { setFeedback({ kind: 'error', message: result.errors[0] ?? 'A observação não pode ser aprovada.' }); return; }
    if (persistProducts(result.catalogue.products)) {
      const rawAudit = window.localStorage.getItem(OBSERVATION_AUDIT_STORAGE_KEY);
      const audit = rawAudit ? JSON.parse(rawAudit) as unknown[] : [];
      window.localStorage.setItem(OBSERVATION_AUDIT_STORAGE_KEY, JSON.stringify([...audit, result.audit]));
      persistObservations(observations.map((item) => item.id === observation.id ? { ...item, reviewStatus: 'approved' } : item));
      setApproval(null); setFeedback({ kind: 'success', message: 'Observação aprovada e registada no histórico de auditoria.' });
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

  /* Disabled external Cesta integration is retained in src/lib/pricing/cesta-mcp.ts. */
  const beginCestaSearch = async (product: Product) => {
    void product;
    setFeedback({ kind: 'error', message: 'A pesquisa externa está desactivada. Introduza ou importe os dados localmente.' });
    return;
    /*
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
    */
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

  const beginScraplingRefresh = async (useFallback = false) => {
    setScraplingReview({ loading: true, candidates: [] });
    setFeedback(null);
    try {
      const res = await fetch('/api/scrapling/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useFallback }),
      });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        fallbackAvailable?: boolean;
        products?: Array<{
          name: string;
          brand: string | null;
          supermarketId: SupermarketId;
          packSize: number;
          unit: BaseUnit;
          price: number;
          unitPrice?: { amount: number; unit: 'kg' | 'l' | 'un' };
          isWeighted?: boolean;
          productUrl: string;
          retrievedAt: string;
          sourceProductId: string;
          suggestedIngredientId?: string;
          weightedNote?: string;
        }>;
      };
      if (!res.ok || !data.ok) {
        setScraplingReview({
          loading: false,
          error: data.error || ptPT.scraplingPythonUnavailable,
          fallbackAvailable: Boolean(data.fallbackAvailable),
          candidates: [],
        });
        return;
      }
      const candidates: ScraplingCandidateReview[] = (data.products || []).map((p, idx) => {
        const suggested = seedCatalogue.ingredients.find((i) => i.id === p.suggestedIngredientId);
        const defaultIngredient = suggested ?? seedCatalogue.ingredients[0]!;
        return {
          id: `scrapling-${p.supermarketId}-${p.sourceProductId || idx}`,
          name: p.name,
          brand: p.brand || null,
          supermarketId: p.supermarketId,
          packSize: p.packSize,
          unit: defaultIngredient.baseUnit ?? p.unit ?? 'g',
          price: p.price,
          unitPrice: p.unitPrice,
          isWeighted: Boolean(p.isWeighted),
          productUrl: p.productUrl,
          retrievedAt: p.retrievedAt || new Date().toISOString(),
          sourceProductId: p.sourceProductId || `pid-${idx}`,
          ingredientId: defaultIngredient.id,
          allergens: 'unknown',
          dietCompatibility: {
            vegetariana: 'desconhecido',
            vegana: 'desconhecido',
            sem_gluten: 'desconhecido',
            sem_lactose: 'desconhecido',
          },
          weightedNote: p.weightedNote,
          approved: false,
        };
      });
      setScraplingReview({ loading: false, candidates });
    } catch (err) {
      setScraplingReview({
        loading: false,
        error: err instanceof Error ? err.message : ptPT.scraplingPythonUnavailable,
        fallbackAvailable: true,
        candidates: [],
      });
    }
  };

  const updateCandidateIngredient = (id: string, ingredientId: string) => {
    const ingredient = seedCatalogue.ingredients.find((i) => i.id === ingredientId);
    setScraplingReview((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map((c) => (c.id === id ? { ...c, ingredientId, unit: ingredient?.baseUnit ?? c.unit } : c)),
      };
    });
  };

  const updateCandidateAllergens = (id: string, allergens: AllergenInfo) => {
    setScraplingReview((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map((c) => (c.id === id ? { ...c, allergens } : c)),
      };
    });
  };

  const updateCandidateDiet = (id: string, tag: DietTag, status: DietStatus) => {
    setScraplingReview((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        candidates: prev.candidates.map((c) => (c.id === id ? { ...c, dietCompatibility: { ...c.dietCompatibility, [tag]: status } } : c)),
      };
    });
  };

  const approveScraplingCandidate = (c: ScraplingCandidateReview) => {
    if (!isCandidateSafetyConfirmed(c)) return;
    const checkedAt = c.retrievedAt;
    const checkedDate = lisbonDate(checkedAt);
    const newProduct: Product = {
      id: `scrapling-${c.supermarketId}-${c.sourceProductId}`,
      name: c.name,
      brand: c.brand,
      supermarketId: c.supermarketId,
      ingredientId: c.ingredientId,
      packSize: c.packSize,
      unit: c.unit,
      price: c.price,
      priceState: 'observado',
      priceUpdatedAt: checkedDate,
      priceObservation: {
        provider: 'scrapling',
        sourceProductId: c.sourceProductId,
        checkedAt,
        checkedDate,
        currency: 'EUR',
        availability: 'available',
        ...(c.unitPrice ? { unitPrice: c.unitPrice } : {}),
      },
      allergens: c.allergens,
      dietCompatibility: c.dietCompatibility,
      productUrl: c.productUrl,
      catalogueSource: 'scrapling',
    };

    const previous = products.find((p) => p.id === newProduct.id);
    const withHistory = previous
      ? withPriceHistory(previous, newProduct, checkedAt, 'Observação Scrapling')
      : { ...newProduct, priceHistory: initialPriceHistory(newProduct, checkedAt, 'Observação Scrapling') };
    const nextProducts = previous
      ? products.map((p) => (p.id === previous.id ? withHistory : p))
      : [...products, withHistory];

    if (persistProducts(nextProducts)) {
      setScraplingReview((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          candidates: prev.candidates.map((item) => (item.id === c.id ? { ...item, approved: true } : item)),
        };
      });
      setFeedback({ kind: 'success', message: ptPT.scraplingProductApproved });
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
      {scraplingReview && (
        <section className="scrapling-review-panel" aria-label={ptPT.scraplingReviewTitle}>
          <div className="scrapling-review-header">
            <div>
              <h2>{ptPT.scraplingReviewTitle}</h2>
              <p>{ptPT.scraplingReviewDescription}</p>
            </div>
            <button className="text-link" type="button" onClick={() => setScraplingReview(null)}>
              {ptPT.scraplingDismiss}
            </button>
          </div>

          {scraplingReview.loading && <p className="loading-message">{ptPT.scraplingLoading}</p>}

          {scraplingReview.error && (
            <div className="scrapling-error-banner" role="alert">
              <p>{scraplingReview.error}</p>
              {scraplingReview.fallbackAvailable && (
                <button className="button button-secondary" type="button" onClick={() => void beginScraplingRefresh(true)}>
                  {ptPT.scraplingLoadHistorical}
                </button>
              )}
            </div>
          )}

          {scraplingReview.candidates.length > 0 && (
            <div className="scrapling-candidates-grid">
              {scraplingReview.candidates.map((candidate) => (
                <ScraplingCandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  onIngredientChange={(ingredientId) => updateCandidateIngredient(candidate.id, ingredientId)}
                  onAllergensChange={(allergens) => updateCandidateAllergens(candidate.id, allergens)}
                  onDietChange={(tag, status) => updateCandidateDiet(candidate.id, tag, status)}
                  onApprove={() => approveScraplingCandidate(candidate)}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {adding && draft && priceForm && <ProductEditor draft={draft} priceForm={priceForm} isNew onChange={setDraft} onPriceFormChange={setPriceForm} onSave={saveDraft} onCancel={cancelEdit} />}
      <section className="catalogue-import-card observation-review-card" aria-label="Observações para revisão">
        <div><h2>Observações de fontes</h2><p>Importe JSON do collector ou de uma fonte aberta. As observações ficam separadas do catálogo e nunca são aprovadas automaticamente.</p></div>
        <label className="file-picker">Escolher observações<input type="file" accept=".json,application/json" onChange={(event: ChangeEvent<HTMLInputElement>) => setObservationFile(event.target.files?.[0] ?? null)} /></label>
        <button className="button button-primary" type="button" disabled={!observationFile} onClick={() => void importObservations()}>Importar para revisão</button>
        {observations.length > 0 && <div className="observation-review-list">
          {observations.map((observation) => {
            const matches = suggestObservationMatches(observation, { ...seedCatalogue, products });
            return <article className="observation-review-item" key={observation.id}>
              <div><strong>{observation.name ?? 'Produto sem nome'}</strong><span>{observationSourceLabel(observation.source)} · {observation.retailer ? supermarketLabels[observation.retailer] : 'Retalhista desconhecido'} · {observation.observedAt}</span><span>{observation.ean ? `EAN ${observation.ean}` : 'EAN desconhecido'} · {observation.package.size ? `${observation.package.size} ${observation.package.unit ?? ''}` : 'embalagem desconhecida'}</span><span>{observation.price.amount === null ? 'Preço desconhecido' : `${observation.price.amount.toFixed(2)} ${observation.price.currency ?? 'EUR'}`}{observation.price.unitAmount !== null ? ` · ${observation.price.unitAmount.toFixed(2)} €/${observation.price.unit ?? '?'}` : ''}</span><span>{matches.length ? `${matches.length} correspondência(s) sugerida(s); aprovação manual obrigatória.` : 'Sem correspondência automática.'}</span><span>Estado: {observation.reviewStatus === 'rejected' ? 'Rejeitada' : 'Pendente de revisão'}</span></div>
              {observation.sourceUrl && <a href={observation.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte</a>}
              {observation.reviewStatus === 'pending' && <div className="observation-review-actions"><button className="button button-secondary" type="button" onClick={() => rejectObservation(observation.id)}>Rejeitar</button><button className="button button-secondary" type="button" onClick={() => { setApproval({ id: observation.id, action: 'new_product' }); setApprovalPackageSize(observation.package.size?.toString() ?? ''); setApprovalUnit(observation.package.unit ?? 'g'); }}>Aprovar como produto novo</button>{matches[0] && <button className="button button-secondary" type="button" onClick={() => { setApproval({ id: observation.id, action: 'existing_product', targetProductId: matches[0]?.productId }); setApprovalPackageSize(observation.package.size?.toString() ?? ''); setApprovalUnit(observation.package.unit ?? 'g'); }}>Rever correspondência</button>}</div>}
              {approval?.id === observation.id && <div className="observation-approval-form"><label>Ingrediente<select value={approvalIngredient} onChange={(event) => setApprovalIngredient(event.target.value)}>{seedCatalogue.ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name}</option>)}</select></label><label>Tamanho da embalagem<input type="number" min="0.001" step="any" value={approvalPackageSize} onChange={(event) => setApprovalPackageSize(event.target.value)} /></label><label>Unidade<select value={approvalUnit} onChange={(event) => setApprovalUnit(event.target.value as BaseUnit)}><option value="g">g</option><option value="ml">ml</option><option value="un">un</option></select></label><label><input type="checkbox" checked={approvalChecks.identity} onChange={(event) => setApprovalChecks({ ...approvalChecks, identity: event.target.checked })} /> Identidade confirmada</label><label><input type="checkbox" checked={approvalChecks.package} onChange={(event) => setApprovalChecks({ ...approvalChecks, package: event.target.checked })} /> Embalagem confirmada</label><label><input type="checkbox" checked={approvalChecks.allergens} onChange={(event) => setApprovalChecks({ ...approvalChecks, allergens: event.target.checked })} /> Alergénios revistos</label><label><input type="checkbox" checked={approvalChecks.diet} onChange={(event) => setApprovalChecks({ ...approvalChecks, diet: event.target.checked })} /> Dieta revista</label><button className="button button-primary" type="button" onClick={approveImportedObservation}>Confirmar aprovação</button><button className="button button-secondary" type="button" onClick={() => setApproval(null)}>Cancelar</button></div>}
            </article>;
          })}
        </div>}
      </section>
      <section className="catalogue-list" aria-label={ptPT.productCatalogueTitle}>
        <div className="catalogue-list-heading"><strong>{filteredProducts.length} {ptPT.products}</strong><span>{ptPT.pricesDoNotChangeSource}</span></div>
        {filteredProducts.map((product) => <article className="catalogue-product-card" key={product.id}>
          {editingId === product.id && draft && priceForm ? <ProductEditor draft={draft} priceForm={priceForm} isNew={false} onChange={setDraft} onPriceFormChange={setPriceForm} onSave={saveDraft} onCancel={cancelEdit} /> : <>
            <div className="catalogue-product-summary"><div className="catalogue-product-icon" aria-hidden="true">{product.supermarketId === 'continente' ? 'C' : 'P'}</div><div className="catalogue-product-title"><div><strong>{product.name}</strong>{isGeneric(product) && <span className="generic-tag">{ptPT.sourceGeneric}</span>}</div><span>{product.brand || ptPT.brandNotProvided} · {supermarketLabels[product.supermarketId]} · {sellingModelLabel(product.sellingModel)} · {new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(product.packSize)} {baseUnitLabels[product.unit]}</span>{product.minimumQuantity && <small>Mínimo: {product.minimumQuantity} {baseUnitLabels[product.minimumQuantityUnit ?? product.unit]}</small>}{product.barcode && <small>EAN: {product.barcode}</small>}{product.externalProductId && <small>{ptPT.sourceProductId}: {product.externalProductId}</small>}</div><div className="catalogue-price"><strong>{product.priceState === 'manual' || product.priceState === 'verificado' || product.priceState === 'observado' ? `${product.price?.toFixed(2)} €` : product.priceState === 'estimativa' ? `${product.estimate?.value.toFixed(2)} €` : ptPT.unknownPrice}</strong><span>{product.priceState === 'observado' && !isCurrentObservation(product) ? ptPT.staleObservedPrice : priceStateLabels[product.priceState]}{product.priceObservation ? ` · ${product.priceObservation.checkedAt}` : product.priceUpdatedAt ? ` · ${product.priceUpdatedAt}` : ''}</span>{product.unitPrice && <small>{product.unitPrice.amount.toFixed(2)} €/{product.unitPrice.unit}</small>}{product.priceObservation?.promotion && <small>{ptPT.promotionObserved}</small>}{product.availability === 'unavailable' && <small>{ptPT.unavailableAtSource}</small>}</div><div className="catalogue-product-actions"><button className="button button-secondary" type="button" onClick={() => beginEdit(product)}>{ptPT.editProduct}</button></div></div>
            <div className="catalogue-product-links">{product.productUrl ? <a href={product.productUrl} target="_blank" rel="noreferrer">{ptPT.openProductSource}</a> : <span>{ptPT.noProductSource}</span>}<button type="button" onClick={() => setHistoryOpenId(historyOpenId === product.id ? null : product.id)}>{ptPT.productHistory} ({product.priceHistory?.length ?? 0})</button></div>
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
      <label>Modelo de venda<select value={draft.sellingModel ?? 'fixed_package'} onChange={(event) => onChange({ ...draft, sellingModel: event.target.value as Product['sellingModel'], minimumQuantity: event.target.value === 'fixed_package' ? null : draft.minimumQuantity })}><option value="fixed_package">Embalagem fixa</option><option value="variable_weight">Vendível a peso/volume</option><option value="per_unit">Por unidade</option></select></label>
      {(draft.sellingModel === 'variable_weight' || draft.sellingModel === 'per_unit') && <label>Quantidade mínima (opcional)<input type="number" min="0.001" step="any" value={draft.minimumQuantity ?? ''} onChange={(event) => onChange({ ...draft, minimumQuantity: event.target.value ? Number(event.target.value) : null, minimumQuantityUnit: draft.unit })} /></label>}
      {draft.sellingModel === 'per_unit' && draft.unit !== 'un' && <label>Quantidade base por unidade<input type="number" min="0.001" step="any" value={draft.unitQuantity ?? ''} onChange={(event) => onChange({ ...draft, unitQuantity: event.target.value ? Number(event.target.value) : null })} /></label>}
      {draft.sellingModel === 'variable_weight' && <label>Peso final conhecido (opcional)<input type="number" min="0.001" step="any" value={draft.actualCheckoutQuantity ?? ''} onChange={(event) => onChange({ ...draft, actualCheckoutQuantity: event.target.value ? Number(event.target.value) : null })} /></label>}
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

function ScraplingCandidateCard({
  candidate,
  onIngredientChange,
  onAllergensChange,
  onDietChange,
  onApprove,
}: {
  candidate: ScraplingCandidateReview;
  onIngredientChange: (ingredientId: string) => void;
  onAllergensChange: (allergens: AllergenInfo) => void;
  onDietChange: (tag: DietTag, status: DietStatus) => void;
  onApprove: () => void;
}) {
  const isSafetyOk = isCandidateSafetyConfirmed(candidate);

  const toggleAllergen = (allergen: Allergen) => {
    if (candidate.allergens === 'unknown') return;
    const next = candidate.allergens.includes(allergen)
      ? candidate.allergens.filter((a) => a !== allergen)
      : [...candidate.allergens, allergen];
    onAllergensChange(next);
  };

  return (
    <article className="scrapling-candidate-card">
      <div className="scrapling-candidate-summary">
        <div className="scrapling-candidate-title">
          <div className="supermarket-tag">{supermarketLabels[candidate.supermarketId]}</div>
          <strong>{candidate.name}</strong>
          <span>
            {candidate.brand || ptPT.brandNotProvided} · {candidate.packSize} {baseUnitLabels[candidate.unit]}
          </span>
          {candidate.isWeighted && <span className="generic-tag">{ptPT.weightedProductNotice}</span>}
          {candidate.weightedNote && <small className="weighted-note">{candidate.weightedNote}</small>}
        </div>

        <div className="scrapling-candidate-price">
          <strong>{candidate.price.toFixed(2)} €</strong>
          {candidate.unitPrice && (
            <span>{candidate.unitPrice.amount.toFixed(2)} €/{candidate.unitPrice.unit}</span>
          )}
          <small>{ptPT.retrievalTimestamp}: {new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(candidate.retrievedAt))}</small>
          <a href={candidate.productUrl} target="_blank" rel="noreferrer" className="text-link">
            {ptPT.openProductSource}
          </a>
        </div>
      </div>

      <div className="scrapling-candidate-form">
        <label className="scrapling-field">
          <span>{ptPT.manualIngredientMatchingNotice}</span>
          <select
            value={candidate.ingredientId}
            onChange={(e) => onIngredientChange(e.target.value)}
          >
            {seedCatalogue.ingredients.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.name} ({categoryLabels[ing.category]})
              </option>
            ))}
          </select>
        </label>

        <fieldset className="scrapling-safety-box">
          <legend>{ptPT.allergensProduct}</legend>
          <label className="checkbox-choice">
            <input
              type="radio"
              name={`allergens-${candidate.id}`}
              checked={candidate.allergens === 'unknown'}
              onChange={() => onAllergensChange('unknown')}
            />
            {ptPT.unknownAllergensOption}
          </label>
          <label className="checkbox-choice">
            <input
              type="radio"
              name={`allergens-${candidate.id}`}
              checked={candidate.allergens !== 'unknown'}
              onChange={() => onAllergensChange(candidate.allergens === 'unknown' ? [] : candidate.allergens)}
            />
            Informação de alergénios conferida no rótulo
          </label>
          {candidate.allergens !== 'unknown' && (
            <div className="allergen-grid">
              {ALLERGENS.map((allergen) => (
                <label className="allergen-checkbox" key={allergen}>
                  <input
                    type="checkbox"
                    checked={candidate.allergens !== 'unknown' && candidate.allergens.includes(allergen)}
                    onChange={() => toggleAllergen(allergen)}
                  />
                  {allergenLabels[allergen]}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="scrapling-safety-box">
          <legend>{ptPT.dietProduct}</legend>
          <div className="diet-editor-grid">
            {DIET_TAGS.map((tag) => (
              <label key={tag}>
                {dietTagLabels[tag]}
                <select
                  value={candidate.dietCompatibility[tag]}
                  onChange={(e) => onDietChange(tag, e.target.value as DietStatus)}
                >
                  <option value="desconhecido">{ptPT.dietStatusUnknown}</option>
                  <option value="compativel">{ptPT.dietStatusCompatible}</option>
                  <option value="incompativel">{ptPT.dietStatusIncompatible}</option>
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {!isSafetyOk && (
        <div className="scrapling-safety-blocked" role="alert">
          {ptPT.scraplingApproveBlockedNotice}
        </div>
      )}

      <div className="scrapling-candidate-actions">
        <button
          className="button button-primary"
          type="button"
          disabled={!isSafetyOk || candidate.approved}
          onClick={onApprove}
        >
          {candidate.approved ? 'Aprovado ✓' : ptPT.scraplingApproveProduct}
        </button>
      </div>
    </article>
  );
}
