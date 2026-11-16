import type { RecipeLine } from '../types';

export function scaleAmount(line: Pick<RecipeLine, 'amount'>, people: number, baseServings: number): number {
  if (!Number.isFinite(people) || people <= 0 || !Number.isFinite(baseServings) || baseServings <= 0) {
    throw new RangeError('People and base servings must be positive finite numbers.');
  }
  return line.amount * people / baseServings;
}
