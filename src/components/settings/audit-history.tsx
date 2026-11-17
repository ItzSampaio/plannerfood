'use client';

import { useEffect, useState } from 'react';
import { OBSERVATION_AUDIT_STORAGE_KEY, OBSERVATIONS_STORAGE_KEY, PRODUCT_AUDIT_STORAGE_KEY, PRODUCT_CATALOGUE_STORAGE_KEY } from '../../lib/data/application-backup';
import { allergenLabels, priceStateLabels } from '../../i18n/labels';
import { catalogue } from '../../lib/catalogue';
import { readSavedCatalogue } from '../../lib/data/product-catalogue';
import { dietTagLabels, dietStatusLabels, supermarketLabels, baseUnitLabels } from '../../i18n/labels';
import { groupPriceHistory } from '../../lib/data/audit';
import { readApplicationItem } from '../../lib/state/application-storage';

type AuditRow = { id: string; date: string | null; title: string; source: string; productId: string | null; observationId: string | null; before: unknown; after: unknown; details: string };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function pretty(value: unknown): string {
  if (value === undefined || value === null) return 'Informação histórica indisponível';
  const translated: Record<string, string> = { manual: 'Manual', verificado: 'Verificado', estimativa: 'Estimativa', desconhecido: 'Desconhecido', observado: 'Observado', fixed_package: 'Embalagem fixa', variable_weight: 'A peso ou volume', per_unit: 'Por unidade' };
  for (const [key, label] of Object.entries(supermarketLabels)) translated[key] = label;
  for (const [key, label] of Object.entries(baseUnitLabels)) translated[key] = label;
  for (const [key, label] of Object.entries(dietTagLabels)) translated[key] = label;
  for (const [key, label] of Object.entries(dietStatusLabels)) translated[key] = label;
  for (const [key, label] of Object.entries(allergenLabels)) translated[key] = label;
  const keys: Record<string, string> = { name: 'Nome', brand: 'Marca', ingredientId: 'ID do ingrediente', supermarketId: 'Supermercado', packSize: 'Tamanho da embalagem', unit: 'Unidade', sellingModel: 'Modelo de venda', price: 'Preço', priceState: 'Estado do preço', priceUpdatedAt: 'Data do preço', allergens: 'Alergénios', dietCompatibility: 'Compatibilidade alimentar', barcode: 'Código de barras', reviewStatus: 'Estado da revisão', effectiveDate: 'Data aplicável', estimate: 'Estimativa', id: 'ID' };
  const translate = (item: unknown, field = ''): unknown => {
    if (typeof item === 'string') return translated[item] ?? item;
    if (typeof item === 'number' && ['price', 'value', 'low', 'high'].includes(field)) return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(item);
    if (item === null) return 'Sem registo';
    if (Array.isArray(item)) return item.map((nested) => translate(nested, field));
    if (isRecord(item)) return Object.fromEntries(Object.entries(item).map(([key, nested]) => [keys[key] ?? key, translate(nested, key)]));
    return item;
  };
  return JSON.stringify(translate(value), null, 2);
}

export function AuditHistory() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  useEffect(() => {
    const next: AuditRow[] = [];
    try {
      const rawCatalog = readApplicationItem(window.localStorage, PRODUCT_CATALOGUE_STORAGE_KEY);
      const products = rawCatalog ? JSON.parse(rawCatalog) as unknown : null;
      const savedCatalogue = readSavedCatalogue(rawCatalog, catalogue);
      const visibleProducts = savedCatalogue?.products ?? catalogue.products;
      const productNames = new Map<string, string>();
      if (isRecord(products) && Array.isArray(products.products)) for (const product of products.products) if (isRecord(product) && typeof product.id === 'string' && typeof product.name === 'string') productNames.set(product.id, product.name);
      const rawObservations = readApplicationItem(window.localStorage, OBSERVATIONS_STORAGE_KEY);
      const observations = rawObservations ? JSON.parse(rawObservations) as unknown : null;
      const observationNames = new Map<string, string>();
      if (isRecord(observations) && Array.isArray(observations.observations)) for (const observation of observations.observations) if (isRecord(observation) && typeof observation.id === 'string') observationNames.set(observation.id, typeof observation.name === 'string' ? observation.name : 'Nome indisponível');
      const rawEvents = readApplicationItem(window.localStorage, PRODUCT_AUDIT_STORAGE_KEY);
      const events = rawEvents ? JSON.parse(rawEvents) as unknown : [];
      if (Array.isArray(events)) for (const event of events) if (isRecord(event)) {
        const kind = event.kind === 'product_created' ? 'Produto criado' : event.kind === 'product_updated' ? 'Produto alterado' : event.kind === 'observation_rejected' ? 'Observação rejeitada' : 'Alteração local';
        const productId = typeof event.productId === 'string' ? event.productId : null;
        const observationId = typeof event.observationId === 'string' ? event.observationId : null;
        const recordedAt = typeof event.recordedAt === 'string' && Number.isFinite(Date.parse(event.recordedAt)) ? event.recordedAt : null;
        next.push({ id: String(event.id ?? next.length), date: recordedAt, title: kind, source: typeof event.source === 'string' ? event.source : 'Origem indisponível', productId, observationId, before: event.before, after: event.after, details: productId ? productNames.get(productId) ?? 'Produto removido ou indisponível no catálogo atual' : observationId ? observationNames.get(observationId) ?? 'Observação não guardada' : '' });
      }
      const rawApprovals = readApplicationItem(window.localStorage, OBSERVATION_AUDIT_STORAGE_KEY);
      const approvals = rawApprovals ? JSON.parse(rawApprovals) as unknown : [];
      if (Array.isArray(approvals)) for (const approval of approvals) if (isRecord(approval)) next.push({ id: `approval-${String(approval.observationId ?? next.length)}`, date: typeof approval.approvedAt === 'string' ? approval.approvedAt : null, title: 'Observação aprovada', source: 'Revisão local', productId: typeof approval.productId === 'string' ? approval.productId : null, observationId: typeof approval.observationId === 'string' ? approval.observationId : null, before: approval.before, after: approval.after, details: typeof approval.productId === 'string' ? productNames.get(approval.productId) ?? 'Produto não disponível no catálogo atual' : '' });
      for (const product of visibleProducts) {
        for (const group of groupPriceHistory(product)) {
          const snapshot = (entry: typeof group.before) => entry ? { price: entry.price, estimate: entry.estimate ?? null, state: priceStateLabels[entry.priceState], effectiveDate: entry.effectiveDate } : null;
          next.push({ id: group.id, date: group.recordedAt, title: 'Registo de preço', source: group.source, productId: product.id, observationId: null, before: snapshot(group.before), after: snapshot(group.after), details: productNames.get(product.id) ?? product.name });
        }
      }
    } catch { /* Malformed local audit is reported as unavailable below. */ }
    next.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const ready = window.setTimeout(() => setRows(next), 0);
    return () => window.clearTimeout(ready);
  }, []);

  return <main className="management-shell"><header className="management-heading"><span className="eyebrow">Registos locais</span><h1>Histórico de alterações</h1><p>O histórico só inclui eventos registados desde que essa função ficou disponível ou informação que já constava no histórico de preços.</p></header>
    {rows === null ? <p role="status">A carregar o histórico…</p> : rows.length === 0 ? <section className="management-card"><h2>Sem registos guardados</h2><p>Não existem eventos de auditoria disponíveis neste dispositivo. Não foram criados registos retroativos.</p></section> : <div className="audit-list">{rows.map((row) => <article className="management-card audit-card" key={row.id}><div className="audit-meta"><span>{row.title}</span><time>{row.date ? new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Lisbon' }).format(new Date(row.date)) : 'Data indisponível'}</time></div><h2>{row.details}</h2><p>Origem: {row.source}</p>{row.productId && <p>Produto: <code>{row.productId}</code></p>}{row.observationId && <p>Observação: <code>{row.observationId}</code></p>}<details><summary>Ver valores original e resultante</summary><div className="audit-values"><section><h3>Original</h3><pre>{pretty(row.before)}</pre></section><section><h3>Resultante</h3><pre>{pretty(row.after)}</pre></section></div></details></article>)}</div>}
    <p className="management-footnote">Os dados permanecem neste navegador. Retalhista: Continente ou Pingo Doce apenas quando identificado no registo; a informação histórica pode estar indisponível.</p>
  </main>;
}
