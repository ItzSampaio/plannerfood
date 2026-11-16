import { describe, expect, it } from 'vitest';
import {
  initialWizardState, parseBudgetInput, parseWizardSnapshot, peopleCount, toUserProfile,
  validateWizardStep, wizardReducer, WIZARD_DRAFT_KEY,
} from '../../src/lib/state/wizard-reducer';

function completeDraftState() {
  let state = initialWizardState();
  state = wizardReducer(state, { type: 'set_supermarket', value: 'continente' });
  state = wizardReducer(state, { type: 'next' });
  state = wizardReducer(state, { type: 'set_people_choice', value: '5plus' });
  state = wizardReducer(state, { type: 'set_people_input', value: '7' });
  state = wizardReducer(state, { type: 'next' });
  state = wizardReducer(state, { type: 'toggle_meal', value: 'jantar' });
  state = wizardReducer(state, { type: 'next' });
  state = wizardReducer(state, { type: 'set_diet', value: 'vegana' });
  state = wizardReducer(state, { type: 'next' });
  state = wizardReducer(state, { type: 'toggle_allergen', value: 'aipo' });
  state = wizardReducer(state, { type: 'set_exclusions', value: ['cogumelos'] });
  state = wizardReducer(state, { type: 'toggle_owned', value: 'arroz' });
  state = wizardReducer(state, { type: 'next' });
  state = wizardReducer(state, { type: 'set_priority', value: 'rapido' });
  state = wizardReducer(state, { type: 'set_budget_input', value: '125,50' });
  return state;
}

describe('setup wizard state', () => {
  it('requires a supermarket, an exact household size and at least one meal', () => {
    let state = initialWizardState();
    expect(validateWizardStep(state)).toBe('supermarket_required');
    state = wizardReducer(state, { type: 'set_supermarket', value: 'pingo_doce' });
    state = wizardReducer(state, { type: 'next' });
    state = wizardReducer(state, { type: 'set_people_choice', value: '5plus' });
    expect(peopleCount(state.draft)).toBeNull();
    expect(validateWizardStep(state)).toBe('people_required');
    state = wizardReducer(state, { type: 'set_people_input', value: '13' });
    expect(validateWizardStep(state)).toBe('people_required');
    state = wizardReducer(state, { type: 'set_people_input', value: '12' });
    state = wizardReducer(state, { type: 'next' });
    expect(validateWizardStep(state)).toBe('meal_required');
  });

  it('validates pt-PT decimal budgets from €10 through €1,000', () => {
    expect(parseBudgetInput('10')).toBe(10);
    expect(parseBudgetInput('1 250')).toBeNull();
    expect(parseBudgetInput('10,50')).toBe(10.5);
    expect(parseBudgetInput('1000,00')).toBe(1000);
    expect(parseBudgetInput('9,99')).toBeNull();
    expect(parseBudgetInput('1000,01')).toBeNull();
    expect(parseBudgetInput('12,345')).toBeNull();
  });

  it('starts with no pantry items selected and converts valid answers to a profile', () => {
    const initial = initialWizardState();
    expect(initial.draft.ownedIngredientIds).toEqual([]);
    const state = completeDraftState();
    expect(validateWizardStep(state)).toBeNull();
    expect(toUserProfile(state.draft)).toEqual({
      supermarketId: 'continente', people: 7, mealTypes: ['jantar'], dietaryRule: 'vegana',
      allergens: ['aipo'], exclusionText: ['cogumelos'], ownedIngredientIds: ['arroz'],
      priority: 'rapido', weeklyBudget: 125.5,
    });
  });

  it('saves a versioned draft and ignores malformed or incompatible storage data', () => {
    const state = completeDraftState();
    const saved = JSON.stringify({ version: 1, state });
    expect(WIZARD_DRAFT_KEY).toBe('smartbasket:wizard-draft:v1');
    expect(parseWizardSnapshot(saved)).toEqual(state);
    expect(parseWizardSnapshot('{bad json')).toBeNull();
    expect(parseWizardSnapshot(JSON.stringify({ version: 2, state }))).toBeNull();
    const corrupted = { ...state, draft: { ...state.draft, allergens: ['not-an-eu-allergen'] } };
    expect(parseWizardSnapshot(JSON.stringify({ version: 1, state: corrupted }))).toBeNull();
  });
});
