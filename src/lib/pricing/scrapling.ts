import type { BaseUnit, SupermarketId } from '../types';

/**
 * Retained integration boundary. The running application does not call this
 * adapter because external retailer fetching is disabled by project policy.
 */
export type ScraplingScrapedItem = {
  name: string;
  brand: string | null;
  supermarketId: SupermarketId;
  packSize: number;
  unit: BaseUnit;
  price: number;
  unitPrice?: { amount: number; unit: 'kg' | 'l' | 'un' };
  productUrl: string;
  retrievedAt: string;
  sourceProductId: string;
  suggestedIngredientId?: string;
  weightedNote?: string;
};
