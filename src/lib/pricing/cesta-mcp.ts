import type { RawObservation } from '../data/observations';
import type { SupermarketId } from '../types';

export const CESTA_ENDPOINT = 'https://cesta.pt/mcp';
export const ALLOWED_CESTA_TOOLS = ['search_products', 'get_product', 'compare_price', 'build_basket', 'whats_on_promo'] as const;
export type AllowedCestaTool = typeof ALLOWED_CESTA_TOOLS[number];
export const PROHIBITED_CESTA_TOOLS = ['create_basket', 'add_items_to_basket', 'create_checkout_link'] as const;

type JsonRpc = { result?: { content?: Array<{ type?: string; text?: string }> }; error?: { message?: string } };
async function rpc(method: string, id: number, params: Record<string, unknown>): Promise<JsonRpc> {
  const response = await fetch(CESTA_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`A cesta.pt respondeu com o estado ${response.status}.`);
  const body = await response.text();
  const data = body.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim() ?? body;
  const parsed = JSON.parse(data) as JsonRpc;
  if (parsed.error) throw new Error(parsed.error.message ?? 'A cesta.pt devolveu um erro.');
  return parsed;
}

async function callAllowedTool(tool: AllowedCestaTool, args: Record<string, unknown>): Promise<unknown> {
  if (!ALLOWED_CESTA_TOOLS.includes(tool)) throw new Error('Ferramenta Cesta não permitida.');
  await rpc('initialize', 1, { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'SmartBasket', version: '1.0.0' } });
  const result = await rpc('tools/call', 2, { name: tool, arguments: args });
  const text = result.result?.content?.filter((entry) => entry.type === 'text').map((entry) => entry.text ?? '').join('\n') ?? '';
  if (!text) throw new Error('A cesta.pt não devolveu dados interpretáveis.');
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

export async function searchCestaObservations(query: string, retailer?: SupermarketId): Promise<RawObservation[]> {
  const result = await callAllowedTool('search_products', { query, ...(retailer ? { stores: [retailer === 'pingo_doce' ? 'pingodoce' : retailer] } : {}), limit: 6 });
  return normalizeResults(result, 'search_products');
}

export function parseCestaText(text: string, observedAt: string): RawObservation[] {
  const observations: RawObservation[] = [];
  const pattern = new RegExp(`^-\\s*(Continente|Pingo Doce)\\s+\\u00b7\\s+(.+?)\\s+\\u00b7\\s+(?:emb\\.\\s+)?([^\\u00b7]+?)\\s+\\u00b7\\s+(\\d+[,.]\\d{1,2})\\u20ac(?:\\s+\\(antes\\s+(\\d+[,.]\\d{1,2})\\u20ac,\\s*(-?\\d+)%\\))?(?:\\s+\\u00b7\\s+(\\d+[,.]\\d{1,2})\\u20ac\\/(kg|l|un))?\\s+\\u00b7\\s+pid\\s+([\\w-]+)\\s*$`, 'i');
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(pattern);
    const url = lines[index + 1]?.trim();
    if (!match || !url) continue;
    const retailer = match[1]?.toLowerCase() === 'continente' ? 'continente' : 'pingo_doce';
    observations.push({ id: `cesta-search-${retailer}-${match[9]}`, source: 'cesta_mcp', retailer, sourceProductId: match[9] ?? null, ean: null, name: match[2]?.trim() ?? null, brand: null, package: { size: parsePackageSize(match[3] ?? ''), unit: parsePackageUnit(match[3] ?? ''), text: match[3]?.trim() ?? null, fixed: true }, price: { amount: parseDecimal(match[4]), currency: 'EUR', unitAmount: parseDecimal(match[7]), unit: match[8] === 'kg' || match[8] === 'l' || match[8] === 'un' ? match[8] : null, promotionalAmount: match[6] ? parseDecimal(match[4]) : null, originalAmount: parseDecimal(match[5]) }, sourceUrl: url, observedAt, raw: { text: lines[index], url }, retrievalError: null, ingredients: null, allergens: 'unknown', nutrition: null, dietaryCompatibility: null, reviewStatus: 'pending' });
  }
  return observations;
}

function normalizeResults(result: unknown, sourceTool: string): RawObservation[] {
  const now = new Date().toISOString();
  if (typeof result === 'string') return parseCestaText(result, now);
  const values = Array.isArray(result) ? result : record(result).products ?? record(result).results ?? record(result).items ?? [result];
  return (Array.isArray(values) ? values : [values]).filter((value) => typeof value === 'object' && value !== null).map((value, index) => observationFromCesta(record(value), now, sourceTool, index));
}

function parseDecimal(value: string | undefined): number | null { return value ? Number(value.replace(',', '.')) : null; }
function parsePackageSize(value: string): number | null { const match = value.match(/(\d+(?:[,.]\d+)?)\s*(kg|g|l|ml|un)/i); if (!match?.[1] || !match[2]) return null; const amount = Number(match[1].replace(',', '.')); return match[2].toLowerCase() === 'kg' || match[2].toLowerCase() === 'l' ? amount * 1000 : amount; }
function parsePackageUnit(value: string): 'g' | 'ml' | 'un' | null { const match = value.match(/\d+(?:[,.]\d+)?\s*(kg|g|l|ml|un)/i); if (!match?.[1]) return null; const unit = match[1].toLowerCase(); return unit === 'kg' || unit === 'g' ? 'g' : unit === 'l' || unit === 'ml' ? 'ml' : 'un'; }

function observationFromCesta(value: Record<string, unknown>, observedAt: string, sourceTool: string, index: number): RawObservation {
  const retailer = retailerId(value.retailer ?? value.store ?? value.supermarket);
  const price = number(value.price ?? value.current_price);
  const unitPrice = record(value.unitPrice ?? value.unit_price);
  return { id: `cesta-${sourceTool}-${text(value.id ?? value.pid) ?? index}-${observedAt}`, source: 'manual_import', retailer, sourceProductId: text(value.id ?? value.pid), ean: text(value.ean ?? value.gtin ?? value.barcode), name: text(value.name ?? value.product_name), brand: text(value.brand), package: { size: number(record(value.package).size ?? value.packageSize ?? value.pack_size), unit: baseUnit(record(value.package).unit ?? value.packageUnit ?? value.unit), text: text(record(value.package).text ?? value.package_text), fixed: null }, price: { amount: price, currency: text(value.currency) ?? 'EUR', unitAmount: number(unitPrice.amount), unit: priceUnit(unitPrice.unit), promotionalAmount: number(record(value.promotion).price ?? value.promo_price), originalAmount: number(record(value.promotion).regularPrice ?? value.original_price) }, sourceUrl: text(value.url ?? value.product_url), observedAt, raw: value, retrievalError: null, ingredients: text(value.ingredients), allergens: value.allergens === 'unknown' || Array.isArray(value.allergens) ? value.allergens : 'unknown', nutrition: value.nutrition ?? null, dietaryCompatibility: null, reviewStatus: 'pending' };
}

function record(value: unknown): Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown): string | null { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function number(value: unknown): number | null { const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN; return Number.isFinite(n) ? n : null; }
function retailerId(value: unknown): SupermarketId | null { const textValue = text(value)?.toLowerCase(); return textValue === 'continente' ? 'continente' : textValue === 'pingodoce' || textValue === 'pingo_doce' || textValue === 'pingo doce' ? 'pingo_doce' : null; }
function baseUnit(value: unknown): 'g' | 'ml' | 'un' | null { return value === 'g' || value === 'ml' || value === 'un' ? value : null; }
function priceUnit(value: unknown): 'kg' | 'l' | 'un' | null { return value === 'kg' || value === 'l' || value === 'un' ? value : null; }
