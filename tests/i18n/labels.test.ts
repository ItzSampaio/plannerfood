import { describe, expect, it } from 'vitest';
import { ALLERGENS, DIET_TAGS } from '../../src/lib/types';
import { allergenLabels, baseUnitLabels, categoryLabels, dietLabels, dietStatusLabels, dietTagLabels, looseUnitLabels, mealLabels, priceStateLabels, priorityLabels, recipeTagLabels, supermarketLabels, weekdayLabels } from '../../src/i18n/labels';

describe('pt-PT enum labels', () => {
  it('defines pt-PT labels for every EU-14 allergen and diet rule', () => {
    expect(Object.keys(allergenLabels).sort()).toEqual([...ALLERGENS].sort());
    expect(Object.keys(dietTagLabels).sort()).toEqual([...DIET_TAGS].sort());
    expect(Object.keys(dietLabels).sort()).toEqual([...DIET_TAGS, 'nenhuma'].sort());
  });

  it('defines labels for every remaining domain enum', () => {
    expect(Object.keys(mealLabels)).toHaveLength(4);
    expect(Object.keys(priorityLabels)).toHaveLength(4);
    expect(Object.keys(recipeTagLabels)).toHaveLength(3);
    expect(Object.keys(weekdayLabels)).toHaveLength(7);
    expect(Object.keys(priceStateLabels)).toHaveLength(5);
    expect(Object.keys(categoryLabels)).toHaveLength(5);
    expect(Object.keys(supermarketLabels)).toHaveLength(2);
    expect(Object.keys(baseUnitLabels)).toHaveLength(3);
    expect(Object.keys(looseUnitLabels)).toHaveLength(4);
    expect(Object.keys(dietStatusLabels)).toHaveLength(3);
  });
});
