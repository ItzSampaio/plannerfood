import { ALLERGENS, type Allergen, type DietaryRule, type MealType, type Priority, type SupermarketId, type UserProfile } from '../types';

export type PeopleChoice = '1' | '2' | '3' | '4' | '5plus';
export type WizardDraft = {
  supermarketId: SupermarketId | null;
  peopleChoice: PeopleChoice | null;
  peopleInput: string;
  mealTypes: MealType[];
  dietaryRule: DietaryRule | null;
  allergens: Allergen[];
  exclusionText: string[];
  ownedIngredientIds: string[];
  priority: Priority | null;
  weeklyBudgetInput: string;
};
export type WizardState = { draft: WizardDraft; stepIndex: number; completed: boolean };
export type WizardErrorCode = 'supermarket_required' | 'people_required' | 'meal_required' | 'diet_required' | 'priority_required' | 'budget_invalid';

export type WizardAction =
  | { type: 'restore'; state: WizardState }
  | { type: 'set_supermarket'; value: SupermarketId }
  | { type: 'set_people_choice'; value: PeopleChoice }
  | { type: 'set_people_input'; value: string }
  | { type: 'toggle_meal'; value: MealType }
  | { type: 'set_diet'; value: DietaryRule }
  | { type: 'toggle_allergen'; value: Allergen }
  | { type: 'set_exclusions'; value: string[] }
  | { type: 'toggle_owned'; value: string }
  | { type: 'set_priority'; value: Priority }
  | { type: 'set_budget_input'; value: string }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'complete' }
  | { type: 'restart' };

export const WIZARD_DRAFT_KEY = 'smartbasket:wizard-draft:v1';
export const WIZARD_STEPS = 6;

export function initialWizardState(): WizardState {
  return {
    draft: {
      supermarketId: null, peopleChoice: null, peopleInput: '', mealTypes: [], dietaryRule: null,
      allergens: [], exclusionText: [], ownedIngredientIds: [], priority: null, weeklyBudgetInput: '',
    },
    stepIndex: 0,
    completed: false,
  };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'restore': return action.state;
    case 'set_supermarket': return { ...state, draft: { ...state.draft, supermarketId: action.value }, completed: false };
    case 'set_people_choice': return {
      ...state,
      draft: {
        ...state.draft, peopleChoice: action.value,
        peopleInput: action.value === '5plus' ? state.draft.peopleInput : action.value,
      },
      completed: false,
    };
    case 'set_people_input': return { ...state, draft: { ...state.draft, peopleInput: action.value }, completed: false };
    case 'toggle_meal': {
      const selected = state.draft.mealTypes.includes(action.value);
      return { ...state, draft: { ...state.draft, mealTypes: selected ? state.draft.mealTypes.filter((meal) => meal !== action.value) : [...state.draft.mealTypes, action.value] }, completed: false };
    }
    case 'set_diet': return { ...state, draft: { ...state.draft, dietaryRule: action.value }, completed: false };
    case 'toggle_allergen': {
      const selected = state.draft.allergens.includes(action.value);
      return { ...state, draft: { ...state.draft, allergens: selected ? state.draft.allergens.filter((allergen) => allergen !== action.value) : [...state.draft.allergens, action.value] }, completed: false };
    }
    case 'set_exclusions': return { ...state, draft: { ...state.draft, exclusionText: action.value }, completed: false };
    case 'toggle_owned': {
      const selected = state.draft.ownedIngredientIds.includes(action.value);
      return { ...state, draft: { ...state.draft, ownedIngredientIds: selected ? state.draft.ownedIngredientIds.filter((id) => id !== action.value) : [...state.draft.ownedIngredientIds, action.value] }, completed: false };
    }
    case 'set_priority': return { ...state, draft: { ...state.draft, priority: action.value }, completed: false };
    case 'set_budget_input': return { ...state, draft: { ...state.draft, weeklyBudgetInput: action.value }, completed: false };
    case 'next': return { ...state, stepIndex: Math.min(WIZARD_STEPS, state.stepIndex + 1) };
    case 'back': return { ...state, stepIndex: Math.max(0, state.stepIndex - 1), completed: false };
    case 'complete': return { ...state, completed: true };
    case 'restart': return initialWizardState();
  }
}

export function parseBudgetInput(input: string): number | null {
  const normalized = input.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 10 && value <= 1000 ? value : null;
}

export function peopleCount(draft: WizardDraft): number | null {
  if (draft.peopleChoice === null) return null;
  if (draft.peopleChoice !== '5plus') return Number(draft.peopleChoice);
  if (!/^\d+$/.test(draft.peopleInput)) return null;
  const count = Number(draft.peopleInput);
  return Number.isInteger(count) && count >= 5 && count <= 12 ? count : null;
}

export function validateWizardStep(state: WizardState): WizardErrorCode | null {
  switch (state.stepIndex) {
    case 0: return state.draft.supermarketId ? null : 'supermarket_required';
    case 1: return peopleCount(state.draft) !== null ? null : 'people_required';
    case 2: return state.draft.mealTypes.length > 0 ? null : 'meal_required';
    case 3: return state.draft.dietaryRule ? null : 'diet_required';
    case 4: return null;
    case 5:
      if (!state.draft.priority) return 'priority_required';
      return parseBudgetInput(state.draft.weeklyBudgetInput) !== null ? null : 'budget_invalid';
    default: return null;
  }
}

export function toUserProfile(draft: WizardDraft): UserProfile | null {
  const people = peopleCount(draft);
  const weeklyBudget = parseBudgetInput(draft.weeklyBudgetInput);
  if (!draft.supermarketId || people === null || draft.mealTypes.length === 0 || !draft.dietaryRule || !draft.priority || weeklyBudget === null) return null;
  return {
    supermarketId: draft.supermarketId, people, mealTypes: [...draft.mealTypes], dietaryRule: draft.dietaryRule,
    allergens: [...draft.allergens], exclusionText: [...draft.exclusionText], ownedIngredientIds: [...draft.ownedIngredientIds],
    priority: draft.priority, weeklyBudget,
  };
}

export function parseWizardSnapshot(raw: string | null): WizardState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (record.version !== 1 || typeof record.state !== 'object' || record.state === null) return null;
    const state = record.state as Partial<WizardState>;
    if (!state.draft || typeof state.draft !== 'object' || !Number.isInteger(state.stepIndex) || Number(state.stepIndex) < 0 || Number(state.stepIndex) > WIZARD_STEPS || typeof state.completed !== 'boolean') return null;
    if (!Array.isArray(state.draft.mealTypes) || !Array.isArray(state.draft.allergens) || !Array.isArray(state.draft.exclusionText) || !Array.isArray(state.draft.ownedIngredientIds)) return null;
    const draft = state.draft as WizardDraft;
    if (draft.supermarketId !== null && draft.supermarketId !== 'continente' && draft.supermarketId !== 'pingo_doce') return null;
    if (draft.peopleChoice !== null && !['1', '2', '3', '4', '5plus'].includes(draft.peopleChoice)) return null;
    if (draft.dietaryRule !== null && !['nenhuma', 'vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'].includes(draft.dietaryRule)) return null;
    if (draft.priority !== null && !['mais_barato', 'saudavel', 'rapido', 'melhor_valor'].includes(draft.priority)) return null;
    if (!draft.mealTypes.every((meal) => ['pequeno_almoco', 'almoco', 'jantar', 'lanche'].includes(String(meal)))) return null;
    if (!draft.allergens.every((allergen) => ALLERGENS.includes(allergen))) return null;
    if (![...draft.exclusionText, ...draft.ownedIngredientIds].every((entry) => typeof entry === 'string')) return null;
    if (typeof draft.peopleInput !== 'string' || typeof draft.weeklyBudgetInput !== 'string') return null;
    if (state.completed && !toUserProfile(draft)) return null;
    return { draft, stepIndex: Number(state.stepIndex), completed: state.completed };
  } catch {
    return null;
  }
}
