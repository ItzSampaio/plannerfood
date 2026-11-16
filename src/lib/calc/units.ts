import type { Ingredient, RecipeLine } from '../types';

export type ConvertedQuantity = { quantity: number; uncertain: false } | { quantity: null; uncertain: true };

export function convertToBaseUnits(line: RecipeLine, ingredient: Ingredient, scaledAmount: number): ConvertedQuantity {
  if (line.unit === ingredient.baseUnit) return { quantity: scaledAmount, uncertain: false };
  const conversion = ingredient.unitConversions?.[line.unit as keyof NonNullable<Ingredient['unitConversions']>];
  if (typeof conversion !== 'number' || !Number.isFinite(conversion) || conversion <= 0) return { quantity: null, uncertain: true };
  return { quantity: scaledAmount * conversion, uncertain: false };
}
