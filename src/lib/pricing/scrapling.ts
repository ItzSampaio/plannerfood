import type { BaseUnit, SupermarketId } from '../types';

export type ScraplingScrapedItem = {
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
};

// Historical observations of the tested public URLs
export const TESTED_HISTORICAL_OBSERVATIONS: ScraplingScrapedItem[] = [
  {
    name: 'Arroz Agulha Continente',
    brand: 'Continente',
    supermarketId: 'continente',
    packSize: 1000,
    unit: 'g',
    price: 1.15,
    unitPrice: { amount: 1.15, unit: 'kg' },
    isWeighted: false,
    productUrl: 'https://www.continente.pt/produto/arroz-agulha-continente-2027209.html',
    retrievedAt: '2026-11-17T12:00:00.000Z',
    sourceProductId: '2027209',
    suggestedIngredientId: 'arroz',
  },
  {
    name: 'Banana Importada Continente',
    brand: 'Continente',
    supermarketId: 'continente',
    packSize: 1000,
    unit: 'g',
    price: 1.19,
    unitPrice: { amount: 1.19, unit: 'kg' },
    isWeighted: true,
    productUrl: 'https://www.continente.pt/produto/banana-importada-2003051.html',
    retrievedAt: '2026-11-17T12:00:00.000Z',
    sourceProductId: '2003051',
    suggestedIngredientId: 'banana',
    weightedNote: 'Produto vendido a peso: 1,19 €/kg (referência aprox. 0,24 €/unidade média de 200 g).',
  },
  {
    name: 'Pizza Mozzarella Ristorante Dr. Oetker',
    brand: 'Dr. Oetker',
    supermarketId: 'pingo_doce',
    packSize: 355,
    unit: 'g',
    price: 3.79,
    unitPrice: { amount: 10.68, unit: 'kg' },
    isWeighted: false,
    productUrl: 'https://www.pingodoce.pt/home/produtos/congelados/pizzas-e-refeicoes-prontas/pizzas/pizza-ristorante-mozzarella-dr-oetker-355g.html',
    retrievedAt: '2026-11-17T12:00:00.000Z',
    sourceProductId: 'dr-oetker-pizza-mozzarella-355g',
    suggestedIngredientId: 'queijo',
  },
];
