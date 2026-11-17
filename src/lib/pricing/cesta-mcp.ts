import type { BaseUnit, PriceObservation, Product, SupermarketId } from '../types';

export type CestaCandidate = {
  supermarketId: SupermarketId;
  name: string;
  packageText: string;
  price: number;
  unitPrice?: { amount: number; unit: 'kg' | 'l' | 'un' };
  promotion?: { regularPrice: number; discountPercent: number | null; validUntil: null };
  sourceProductId: string;
  url: string;
};

export type CestaProductDetails = {
  supermarketId: SupermarketId;
  name: string;
  brand: string | null;
  price: number | null;
  available: boolean;
  barcodes: string[];
  url: string;
};

type JsonRpcResult = { result?: { content?: Array<{ type?: string; text?: string }>; isError?: boolean; serverInfo?: { name: string; version: string } }; error?: { message?: string } };
const ENDPOINT = 'https://cesta.pt/mcp';
const MCP_PROTOCOL_VERSION = '2025-03-26';

function eventResult(body: string): JsonRpcResult {
  const data = body.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
  const payload = data || body;
  try { return JSON.parse(payload) as JsonRpcResult; }
  catch { throw new Error('A cesta.pt devolveu uma resposta MCP que não foi possível interpretar.'); }
}

async function rpc(method: string, id: number, params: Record<string, unknown> = {}): Promise<JsonRpcResult> {
  throw new Error('A integração Cesta está desactivada; não são feitas chamadas externas.');
  /* const response = await fetch(ENDPOINT, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  if (!response.ok) throw new Error(`A cesta.pt respondeu com o estado ${response.status}.`);
  const result = eventResult(await response.text());
  if (result.error) throw new Error(result.error.message ?? 'A cesta.pt devolveu um erro.');
  if (result.result?.isError) throw new Error(result.result.content?.map((entry) => entry.text ?? '').join('\n') || 'A pesquisa na cesta.pt falhou.');
  return result; */
}

async function callTool(name: string, args: Record<string, unknown>): Promise<string> {
  void name; void args;
  throw new Error('A integração Cesta está desactivada; não são feitas chamadas externas.');
  /*
  const initialized = await rpc('initialize', 1, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'SmartBasket', version: '1.0.0' },
  });
  if (initialized.result?.serverInfo === undefined) throw new Error('A cesta.pt não confirmou a inicialização MCP.');
  await fetch(ENDPOINT, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  });
  const response = await rpc('tools/call', 2, { name, arguments: args });
  const content = response.result?.content?.filter((entry) => entry.type === 'text').map((entry) => entry.text ?? '').join('\n');
  if (!content) throw new Error('A cesta.pt não devolveu informação de produto.');
  return content; */
}

function parseEuros(input: string): number | null {
  const match = input.trim().match(/^(\d+(?:[.,]\d{1,2})?)\s*€$/);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(',', '.'));
  return Number.isFinite(value) && Math.round(value * 100) / 100 === value ? value : null;
}

function supermarketFromLabel(label: string): SupermarketId | null {
  if (label === 'Continente') return 'continente';
  if (label === 'Pingo Doce') return 'pingo_doce';
  return null;
}

function parseCandidateLine(line: string, urlLine: string): CestaCandidate | null {
  const normalized = line.trim().replace(/^-\s*/, '');
  const idMatch = normalized.match(/\s+·\s+pid\s+([\w-]+)\s*$/);
  if (!idMatch?.[1]) return null;
  const body = normalized.slice(0, idMatch.index).split(' · ');
  if (body.length < 3 || !body[0]) return null;
  const firstDot = body[0].indexOf(' · ');
  if (firstDot < 0) return null;
  const supermarketId = supermarketFromLabel(body[0].slice(0, firstDot));
  const name = body[0].slice(firstDot + 3).trim();
  const priceIndex = body.findIndex((part) => /^\d+[,.]\d{1,2}\s*€/.test(part));
  if (!supermarketId || !name || priceIndex < 2) return null;
  const priceToken = body[priceIndex] ?? '';
  const promoMatch = priceToken.match(/^(\d+[,.]\d{1,2})\s*€\s*\(antes\s+(\d+[,.]\d{1,2})\s*€,\s*(-?\d+)%\)$/i);
  const price = parseEuros(promoMatch ? `${promoMatch[1]}€` : priceToken);
  if (price === null) return null;
  const packageText = body[1]?.trim() ?? '';
  const unitToken = body.slice(priceIndex + 1).find((part) => /^\d+[,.]\d{1,2}\s*€\/(kg|lt|l|un)$/i.test(part));
  let unitPrice: CestaCandidate['unitPrice'];
  const unitMatch = unitToken?.match(/^(\d+[,.]\d{1,2})\s*€\/(kg|lt|l|un)$/i);
  if (unitMatch?.[1] && unitMatch[2]) unitPrice = { amount: Number(unitMatch[1].replace(',', '.')), unit: unitMatch[2].toLowerCase() === 'kg' ? 'kg' : unitMatch[2].toLowerCase() === 'un' ? 'un' : 'l' };
  const url = urlLine.trim();
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch { return null; }
  const expectedHost = supermarketId === 'continente' ? 'continente.pt' : 'pingodoce.pt';
  if (!(parsedUrl.hostname === expectedHost || parsedUrl.hostname.endsWith(`.${expectedHost}`))) return null;
  return {
    supermarketId, name, packageText, price, sourceProductId: idMatch[1], url,
    ...(unitPrice ? { unitPrice } : {}),
    ...(promoMatch?.[2] ? { promotion: { regularPrice: Number(promoMatch[2].replace(',', '.')), discountPercent: Number(promoMatch[3]), validUntil: null } } : {}),
  };
}

export function parseCestaSearchResults(text: string, supermarketId: SupermarketId): CestaCandidate[] {
  const lines = text.split(/\r?\n/);
  const candidates: CestaCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trimStart().startsWith('-')) continue;
    const urlLine = lines[index + 1] ?? '';
    const candidate = parseCandidateLine(line, urlLine);
    if (candidate?.supermarketId === supermarketId) candidates.push(candidate);
  }
  return candidates;
}

export async function searchCestaProducts(query: string, supermarketId: SupermarketId): Promise<CestaCandidate[]> {
  const text = await callTool('search_products', { query, stores: [supermarketId === 'continente' ? 'continente' : 'pingodoce'], limit: 6 });
  const candidates = parseCestaSearchResults(text, supermarketId);
  if (!candidates.length && /não encontrou|sem resultados|não existe/i.test(text)) return [];
  if (!candidates.length) throw new Error('A resposta da cesta.pt mudou ou não contém produtos interpretáveis; nenhum dado foi guardado.');
  return candidates;
}

export function parseCestaProductDetails(text: string, expected: CestaCandidate): CestaProductDetails {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const first = lines[0] ?? '';
  const supermarketLabel = expected.supermarketId === 'continente' ? 'Continente' : 'Pingo Doce';
  if (!first.startsWith(`${supermarketLabel} · `) || !first.includes(`pid ${expected.sourceProductId}`)) throw new Error('Os detalhes devolvidos não correspondem ao produto selecionado.');
  const name = first.slice(`${supermarketLabel} · `.length).replace(/\s*\(pid\s+[\w-]+\)\s*$/, '').trim();
  const getValue = (label: string) => lines.find((line) => line.startsWith(`${label}:`))?.slice(label.length + 1).trim() ?? null;
  const brand = getValue('Marca');
  const priceText = getValue('Preço');
  const availableText = getValue('Disponível');
  const url = lines.find((line) => line.startsWith('https://')) ?? '';
  const price = priceText ? parseEuros(priceText) : null;
  if (!name || !availableText || !/^sim|não$/i.test(availableText) || !url) throw new Error('Os detalhes da cesta.pt não incluem os campos mínimos esperados.');
  const parsedUrl = new URL(url);
  const expectedHost = expected.supermarketId === 'continente' ? 'continente.pt' : 'pingodoce.pt';
  if (!(parsedUrl.hostname === expectedHost || parsedUrl.hostname.endsWith(`.${expectedHost}`))) throw new Error('A ligação devolvida não pertence ao supermercado esperado.');
  if (availableText.toLowerCase() === 'sim' && price === null) throw new Error('O produto está disponível, mas a resposta não contém um preço válido.');
  const eanText = getValue('EAN');
  const barcodes = eanText ? eanText.split('|').map((code) => code.trim()).filter((code) => /^\d{8,14}$/.test(code)) : [];
  return { supermarketId: expected.supermarketId, name, brand, price, available: availableText.toLowerCase() === 'sim', barcodes, url };
}

export async function getCestaProductDetails(candidate: CestaCandidate): Promise<CestaProductDetails> {
  const text = await callTool('get_product', { store: candidate.supermarketId === 'continente' ? 'continente' : 'pingodoce', pid: candidate.sourceProductId });
  return parseCestaProductDetails(text, candidate);
}

function parsePackSize(text: string, fallbackUnit: BaseUnit): { packSize: number; unit: BaseUnit } | null {
  const normalized = text.toLowerCase().replace(/^emb\.\s*/, '').replace(',', '.');
  const multipack = normalized.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|lt|l|ml|un|unidades?)/i);
  const single = multipack ?? normalized.match(/(\d+(?:\.\d+)?)\s*(kg|g|lt|l|ml|un|unidades?)/i);
  if (!single) return null;
  const first = Number(single[1]);
  const isMultipack = Boolean(multipack);
  const amount = first * (isMultipack ? Number(single[2]) : 1);
  const unitText = (isMultipack ? single[3] : single[2])?.toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0 || !unitText) return null;
  if (unitText === 'kg') return { packSize: amount * 1000, unit: 'g' };
  if (unitText === 'g') return { packSize: amount, unit: 'g' };
  if (unitText === 'l' || unitText === 'lt') return { packSize: amount * 1000, unit: 'ml' };
  if (unitText === 'ml') return { packSize: amount, unit: 'ml' };
  if (unitText === 'un' || unitText === 'unidade' || unitText === 'unidades') return { packSize: amount, unit: 'un' };
  return { packSize: amount, unit: fallbackUnit };
}

export function observedProductFromCesta(
  ingredientProduct: Product,
  candidate: CestaCandidate,
  details: CestaProductDetails,
  checkedAt: string,
  checkedDate: string,
): Product {
  if (candidate.supermarketId !== ingredientProduct.supermarketId || details.supermarketId !== ingredientProduct.supermarketId) throw new Error('O supermercado do produto consultado não corresponde à entrada selecionada.');
  if (candidate.sourceProductId === '' || details.name === '') throw new Error('A resposta da cesta.pt não identificou o produto.');
  const packageText = candidate.packageText || details.name;
  const parsedPack = parsePackSize(packageText, ingredientProduct.unit);
  if (!parsedPack || parsedPack.unit !== ingredientProduct.unit) throw new Error('Não foi possível interpretar o tamanho da embalagem; o produto não foi guardado.');
  const available = details.available && details.price !== null;
  const observation: PriceObservation = {
    provider: 'cesta_mcp', sourceProductId: candidate.sourceProductId, checkedAt, checkedDate, currency: 'EUR',
    availability: available ? 'available' : 'unavailable',
    ...(candidate.unitPrice ? { unitPrice: candidate.unitPrice } : {}),
    ...(candidate.promotion ? { promotion: candidate.promotion } : {}),
  };
  const product: Product = {
    ...ingredientProduct,
    id: `cesta-${ingredientProduct.supermarketId}-${candidate.sourceProductId}`,
    name: details.name,
    supermarketId: details.supermarketId,
    packSize: parsedPack.packSize,
    unit: parsedPack.unit,
    price: available ? details.price : null,
    priceState: available ? 'observado' : 'desconhecido',
    priceUpdatedAt: available ? checkedDate : null,
    estimate: undefined,
    promo: undefined,
    brand: details.brand,
    productUrl: details.url,
    barcode: details.barcodes[0] ?? null,
    barcodes: details.barcodes,
    externalProductId: candidate.sourceProductId,
    availability: available ? 'available' : 'unavailable',
    ...(candidate.unitPrice ? { unitPrice: candidate.unitPrice } : { unitPrice: undefined }),
    priceObservation: observation,
    catalogueSource: 'cesta_mcp',
    allergens: 'unknown',
    dietCompatibility: { vegetariana: 'desconhecido', vegana: 'desconhecido', sem_gluten: 'desconhecido', sem_lactose: 'desconhecido' },
  };
  return product;
}

export function lisbonDate(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(isoTimestamp));
}
