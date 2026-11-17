'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import { ALLERGENS, type Allergen, type Ingredient, type MealType, type SupermarketId } from '../../lib/types';
import { allergenLabels, categoryLabels, dietLabels, mealLabels, priorityLabels, supermarketLabels, wizardStepLabels } from '../../i18n/labels';
import { ptPT } from '../../i18n/pt-PT';
import ingredientsData from '../../data/ingredients.json';
import {
  initialWizardState, parseWizardSnapshot, toUserProfile, validateWizardStep,
  wizardReducer, WIZARD_DRAFT_KEY, WIZARD_STEPS, type WizardErrorCode, type WizardState,
} from '../../lib/state/wizard-reducer';
import { PLAN_STORAGE_KEY } from '../../lib/state/plan-storage';
import { readApplicationItem, removeApplicationItem, writeApplicationItem } from '../../lib/state/application-storage';

const ingredients = ingredientsData as unknown as Ingredient[];
const errorCopy: Record<WizardErrorCode, string> = {
  supermarket_required: ptPT.supermarketRequired,
  people_required: ptPT.peopleRequired,
  meal_required: ptPT.mealRequired,
  diet_required: ptPT.dietRequired,
  priority_required: ptPT.priorityRequired,
  budget_invalid: ptPT.budgetInvalid,
};
const mealChoices: MealType[] = ['pequeno_almoco', 'almoco', 'jantar', 'lanche'];

function euro(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

export function SetupWizard() {
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const [hydrated, setHydrated] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = readApplicationItem(window.localStorage, WIZARD_DRAFT_KEY);
      const saved = parseWizardSnapshot(raw);
      if (saved) dispatch({ type: 'restore', state: saved });
    } catch {
      // Local storage is optional; the wizard remains usable without it.
    }
    // Required to avoid rendering localStorage-backed state during SSR.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      writeApplicationItem(window.localStorage, WIZARD_DRAFT_KEY, JSON.stringify({ version: 1, state }));
    } catch {
      // Local storage is optional; the wizard remains usable without it.
    }
  }, [hydrated, state]);

  const groupedPantry = useMemo(() => {
    const groups = new Map<string, Ingredient[]>();
    for (const ingredient of ingredients) {
      const current = groups.get(ingredient.category) ?? [];
      current.push(ingredient);
      groups.set(ingredient.category, current);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, []);

  if (!hydrated) return <main className="app-shell"><div className="resume-skeleton" aria-live="polite">A preparar a configuração…</div></main>;

  const showValidation = (): boolean => {
    const error = validateWizardStep(state);
    if (error) {
      setValidationMessage(errorCopy[error]);
      return false;
    }
    setValidationMessage(null);
    return true;
  };

  const continueWizard = (): void => {
    if (showValidation()) dispatch({ type: 'next' });
  };

  const finishWizard = (): void => {
    if (!showValidation() || !toUserProfile(state.draft)) return;
    dispatch({ type: 'complete' });
  };

  const stepIndex = state.stepIndex;
  const stepLabel = stepIndex < WIZARD_STEPS ? wizardStepLabels[stepIndex] : 'Resumo';

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="SmartBasket — início">
          <span className="brand-mark" aria-hidden="true">s</span>
          <span><span className="brand-name">SmartBasket</span><span className="brand-caption">{ptPT.brandLine}</span></span>
        </a>
        <div className="local-badge"><span className="local-dot" aria-hidden="true" />{ptPT.localNotice}</div>
      </header>

      <div className="wizard-layout" id="inicio">
        <section className="wizard-main" aria-label="Configuração do plano">
          <div className="wizard-intro">
            <div className="eyebrow">{ptPT.wizardEyebrow}</div>
            <h1>{ptPT.wizardTitle}</h1>
            <p>{ptPT.wizardDescription}</p>
          </div>

          <div className="wizard-card">
            <div className="progress-wrap">
              <div className="progress-meta">
                <span>{state.completed ? 'Configuração concluída' : stepIndex === WIZARD_STEPS ? 'Resumo das preferências' : `${ptPT.stepOf} ${stepIndex + 1} de ${WIZARD_STEPS}`}</span>
                <strong>{state.completed ? '100%' : `${Math.min(stepIndex + 1, WIZARD_STEPS)}/${WIZARD_STEPS}`}</strong>
              </div>
              <div className="progress-track" role="progressbar" aria-label="Progresso da configuração" aria-valuemin={0} aria-valuemax={WIZARD_STEPS} aria-valuenow={state.completed ? WIZARD_STEPS : Math.min(stepIndex + 1, WIZARD_STEPS)}>
                {wizardStepLabels.map((label, index) => <span key={label} className={`progress-segment${index <= stepIndex || state.completed ? ' active' : ''}`} />)}
              </div>
            </div>

            <div className="step-body" aria-live="polite">
              {state.completed ? (
                <div className="completion-panel">
                  <div className="completion-mark" aria-hidden="true">✓</div>
                  <h2>{ptPT.completionTitle}</h2>
                  <p>{ptPT.savedLocally}</p>
                </div>
              ) : stepIndex === WIZARD_STEPS ? (
                <SummaryStep state={state} />
              ) : (
                <>
                  <div className="step-kicker">{stepLabel}</div>
                  {stepIndex === 0 && <SupermarketStep state={state} dispatch={dispatch} />}
                  {stepIndex === 1 && <PeopleStep state={state} dispatch={dispatch} />}
                  {stepIndex === 2 && <MealsStep state={state} dispatch={dispatch} />}
                  {stepIndex === 3 && <DietStep state={state} dispatch={dispatch} />}
                  {stepIndex === 4 && <AllergensPantryStep state={state} dispatch={dispatch} groupedPantry={groupedPantry} />}
                  {stepIndex === 5 && <PriorityBudgetStep state={state} dispatch={dispatch} />}
                </>
              )}
              {validationMessage && <p className="validation-message" role="alert">{validationMessage}</p>}
            </div>

            <div className="wizard-actions">
              {state.completed ? (
                <>
                  <button className="button button-secondary" type="button" onClick={() => { setValidationMessage(null); dispatch({ type: 'back' }); }}>{ptPT.editAnswers}</button>
                  <a className="button button-primary" href="/plan" onClick={() => {
                    try { removeApplicationItem(window.localStorage, PLAN_STORAGE_KEY); } catch { /* The plan route still generates from the saved profile. */ }
                  }}>{ptPT.generatePlan}<span className="button-arrow" aria-hidden="true">→</span></a>
                </>
              ) : stepIndex === 0 ? (
                <><span className="step-footer-note">Demora cerca de 2 minutos</span><button className="button button-primary" type="button" onClick={continueWizard}>{ptPT.continue}<span className="button-arrow" aria-hidden="true">→</span></button></>
              ) : stepIndex === WIZARD_STEPS ? (
                <><button className="button button-secondary" type="button" onClick={() => { setValidationMessage(null); dispatch({ type: 'back' }); }}>{ptPT.editAnswers}</button><button className="button button-primary" type="button" onClick={finishWizard}>{ptPT.completeSetup}<span className="button-arrow" aria-hidden="true">✓</span></button></>
              ) : (
                <><button className="button button-secondary" type="button" onClick={() => { setValidationMessage(null); dispatch({ type: 'back' }); }}>← {ptPT.back}</button><span className="step-footer-note">As respostas são guardadas automaticamente</span><button className="button button-primary" type="button" onClick={continueWizard}>{stepIndex === WIZARD_STEPS - 1 ? ptPT.review : ptPT.continue}<span className="button-arrow" aria-hidden="true">→</span></button></>
              )}
            </div>
          </div>
        </section>

        <aside className="side-panel" aria-label="Informação SmartBasket">
          <div className="side-top"><span className="side-label">SmartBasket</span><span className="side-star" aria-hidden="true">✳</span></div>
          <h2>Mais clareza para decidir o que vai à mesa.</h2>
          <p className="side-copy">Um plano pensado para as suas preferências, com atenção aos ingredientes e ao orçamento semanal.</p>
          <div className="side-benefits">
            <div className="side-benefit"><span className="side-benefit-mark" aria-hidden="true">✓</span><span>As alergias declaradas são exclusões obrigatórias.</span></div>
            <div className="side-benefit"><span className="side-benefit-mark" aria-hidden="true">✓</span><span>As embalagens inteiras entram na estimativa da caixa.</span></div>
            <div className="side-benefit"><span className="side-benefit-mark" aria-hidden="true">✓</span><span>Sem contas, sem preços em tempo real.</span></div>
          </div>
          <div className="side-foot"><span className="side-foot-dot" aria-hidden="true" />{ptPT.localNotice}</div>
        </aside>
      </div>
    </main>
  );
}

type StepProps = { state: WizardState; dispatch: React.Dispatch<Parameters<typeof wizardReducer>[1]> };

function SupermarketStep({ state, dispatch }: StepProps) {
  const choices: { id: SupermarketId; icon: string; subtitle: string }[] = [
    { id: 'continente', icon: 'C', subtitle: 'Plano orientado para este supermercado' },
    { id: 'pingo_doce', icon: 'P', subtitle: 'Plano orientado para este supermercado' },
  ];
  return <>
    <h2 className="step-heading">{ptPT.supermarketQuestion}</h2><p className="step-description">{ptPT.supermarketHelper}</p>
    <div className="option-grid">
      {choices.map((choice) => <button key={choice.id} className={`option-card${state.draft.supermarketId === choice.id ? ' selected' : ''}`} type="button" aria-pressed={state.draft.supermarketId === choice.id} onClick={() => dispatch({ type: 'set_supermarket', value: choice.id })}>
        <span className="option-icon">{choice.icon}</span><span><span className="option-title">{supermarketLabels[choice.id]}</span><span className="option-subtitle">{choice.subtitle}</span></span><span className="option-check" aria-hidden="true">✓</span>
      </button>)}
    </div>
  </>;
}

function PeopleStep({ state, dispatch }: StepProps) {
  const choices = ['1', '2', '3', '4', '5plus'] as const;
  return <>
    <h2 className="step-heading">{ptPT.peopleQuestion}</h2><p className="step-description">{ptPT.peopleHelper}</p>
    <div className="option-grid people-grid" role="group" aria-label={ptPT.peopleQuestion}>
      {choices.map((choice) => <button key={choice} className={`option-card people-choice${state.draft.peopleChoice === choice ? ' selected' : ''}`} type="button" aria-pressed={state.draft.peopleChoice === choice} onClick={() => dispatch({ type: 'set_people_choice', value: choice })}>
        <span>{choice === '5plus' ? <>5 ou mais<small>Indicar número</small></> : choice}</span>
      </button>)}
    </div>
    {state.draft.peopleChoice === '5plus' && <div className="people-input-wrap"><label className="field-label" htmlFor="people-count">{ptPT.peopleInputLabel}</label><input className="text-input" id="people-count" type="number" inputMode="numeric" min={5} max={12} step={1} value={state.draft.peopleInput} onChange={(event) => dispatch({ type: 'set_people_input', value: event.target.value })} placeholder="5–12" /><span className="field-help">{ptPT.peopleInputHint}</span></div>}
  </>;
}

function MealsStep({ state, dispatch }: StepProps) {
  return <>
    <h2 className="step-heading">{ptPT.mealQuestion}</h2><p className="step-description">{ptPT.mealHelper}</p>
    <div className="meal-grid" role="group" aria-label={ptPT.mealQuestion}>
      {mealChoices.map((meal) => {
        const selected = state.draft.mealTypes.includes(meal);
        return <button key={meal} className={`option-card meal-choice${selected ? ' selected' : ''}`} type="button" aria-pressed={selected} onClick={() => dispatch({ type: 'toggle_meal', value: meal })}>
          <span className="option-icon" aria-hidden="true">{meal === 'pequeno_almoco' ? '☼' : meal === 'almoco' ? '◒' : meal === 'jantar' ? '◐' : '✳'}</span><span className="option-title">{mealLabels[meal]}</span><span className="option-check" aria-hidden="true">✓</span>
        </button>;
      })}
    </div>
  </>;
}

function DietStep({ state, dispatch }: StepProps) {
  const choices = ['nenhuma', 'vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'] as const;
  return <>
    <h2 className="step-heading">{ptPT.dietQuestion}</h2><p className="step-description">{ptPT.dietHelper}</p>
    <div className="diet-list" role="radiogroup" aria-label={ptPT.dietQuestion}>
      {choices.map((diet) => <label key={diet} className={`diet-choice${state.draft.dietaryRule === diet ? ' selected' : ''}`}>
        <input type="radio" name="dietary-rule" value={diet} checked={state.draft.dietaryRule === diet} onChange={() => dispatch({ type: 'set_diet', value: diet })} />
        <span>{dietLabels[diet]}</span>
      </label>)}
    </div>
  </>;
}

function AllergensPantryStep({ state, dispatch, groupedPantry }: StepProps & { groupedPantry: [string, Ingredient[]][] }) {
  return <>
    <h2 className="step-heading">{ptPT.safetyQuestion}</h2><p className="step-description">{ptPT.safetyHelper}</p>
    <div className="allergen-grid" role="group" aria-label={ptPT.safetyQuestion}>
      {ALLERGENS.map((allergen: Allergen) => {
        const selected = state.draft.allergens.includes(allergen);
        return <button key={allergen} type="button" className={`allergen-chip${selected ? ' selected' : ''}`} aria-pressed={selected} onClick={() => dispatch({ type: 'toggle_allergen', value: allergen })}>{allergenLabels[allergen]}</button>;
      })}
    </div>
    <div className="disclaimer"><span className="disclaimer-mark" aria-hidden="true">!</span><span>{ptPT.allergenDisclaimer}</span></div>
    <label className="field-label" htmlFor="exclusions">{ptPT.exclusionsLabel}</label>
    <textarea className="text-area" id="exclusions" value={state.draft.exclusionText.join(', ')} onChange={(event) => dispatch({ type: 'set_exclusions', value: event.target.value.split(/[\n,]/).map((term) => term.trim()).filter(Boolean) })} placeholder={ptPT.exclusionsHint} />
    <div className="section-divider" />
    <h3 className="pantry-heading">{ptPT.pantryTitle}</h3><p className="step-description">{ptPT.pantryHelper}</p>
    <div className="pantry-groups">
      {groupedPantry.map(([category, items]) => <div key={category}>
        <h4 className="pantry-group-title">{categoryLabels[category as keyof typeof categoryLabels]}</h4>
        {items.map((ingredient) => <label key={ingredient.id} className="pantry-item"><input type="checkbox" checked={state.draft.ownedIngredientIds.includes(ingredient.id)} onChange={() => dispatch({ type: 'toggle_owned', value: ingredient.id })} /><span>{ingredient.name}</span></label>)}
      </div>)}
    </div>
  </>;
}

function PriorityBudgetStep({ state, dispatch }: StepProps) {
  const choices = ['mais_barato', 'saudavel', 'rapido', 'melhor_valor'] as const;
  return <>
    <h2 className="step-heading">{ptPT.priorityQuestion}</h2><p className="step-description">Escolha a prioridade que melhor se adapta à sua semana.</p>
    <div className="diet-list" role="radiogroup" aria-label={ptPT.priorityQuestion}>
      {choices.map((priority) => <label key={priority} className={`diet-choice${state.draft.priority === priority ? ' selected' : ''}`}>
        <input type="radio" name="priority" value={priority} checked={state.draft.priority === priority} onChange={() => dispatch({ type: 'set_priority', value: priority })} />
        <span>{priorityLabels[priority]}</span>
      </label>)}
    </div>
    <div className="budget-row">
      <div><label className="field-label" htmlFor="weekly-budget">{ptPT.budgetLabel}</label><span className="field-help">{ptPT.budgetRange}</span></div>
      <div className="currency-input-wrap"><span className="currency-symbol" aria-hidden="true">€</span><input className="text-input currency-input" id="weekly-budget" type="text" inputMode="decimal" autoComplete="off" value={state.draft.weeklyBudgetInput} onChange={(event) => dispatch({ type: 'set_budget_input', value: event.target.value })} placeholder="120,00" aria-describedby="budget-help" /></div>
    </div>
    <div className="budget-note" id="budget-help"><b>i</b><span>{ptPT.budgetHint} Os preços não são apresentados como valores em tempo real.</span></div>
  </>;
}

function SummaryStep({ state }: { state: WizardState }) {
  const profile = toUserProfile(state.draft);
  if (!profile) return <><h2 className="step-heading">{ptPT.summaryTitle}</h2><p className="step-description">Reveja os campos antes de guardar.</p></>;
  const summary: [string, string][] = [
    ['Supermercado', supermarketLabels[profile.supermarketId]],
    ['Pessoas', String(profile.people)],
    ['Refeições', profile.mealTypes.map((meal) => mealLabels[meal]).join(', ')],
    ['Regra alimentar', dietLabels[profile.dietaryRule]],
    ['Alergénios', profile.allergens.length ? profile.allergens.map((allergen) => allergenLabels[allergen]).join(', ') : 'Nenhum declarado'],
    ['Outros ingredientes a evitar', profile.exclusionText.length ? profile.exclusionText.join(', ') : 'Nenhum indicado'],
    ['Despensa', profile.ownedIngredientIds.length ? `${profile.ownedIngredientIds.length} ingredientes assinalados` : 'Sem itens assinalados'],
    ['Prioridade', priorityLabels[profile.priority]],
    ['Orçamento semanal', euro(profile.weeklyBudget)],
  ];
  return <>
    <h2 className="step-heading">{ptPT.summaryTitle}</h2><p className="step-description">{ptPT.summaryDescription}</p>
    <dl className="summary-list">{summary.map(([label, value]) => <div className="summary-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </>;
}
