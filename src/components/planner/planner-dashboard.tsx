'use client';

import { useEffect, useMemo, useState } from 'react';
import { catalogue } from '../../lib/catalogue';
import { computeBasket } from '../../lib/calc/basket';
import { getBudgetStatus } from '../../lib/calc/budget-status';
import { formatCents, toCents } from '../../lib/money';
import { readSavedCatalogue } from '../../lib/data/product-catalogue';
import { createWeeklyPlan } from '../../lib/planner/create-plan';
import { PLAN_STORAGE_KEY, readSavedPlan } from '../../lib/state/plan-storage';
import { readApplicationItem, writeApplicationItem } from '../../lib/state/application-storage';
import { parseWizardSnapshot, toUserProfile, WIZARD_DRAFT_KEY } from '../../lib/state/wizard-reducer';
import type { Basket, BudgetStatus, Plan, PlanDay, ProductSelection, UserProfile } from '../../lib/types';
import { categoryLabels, mealLabels, priceStateLabels, supermarketLabels, weekdayLabels } from '../../i18n/labels';
import { ptPT } from '../../i18n/pt-PT';

const SEED_STORAGE_KEY = 'smartbasket:plan-seed:v1';
type View = 'planning' | 'shopping' | 'budget';

function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function statusCopy(status: BudgetStatus): string {
  switch (status) {
    case 'dentro': return ptPT.budgetWithin;
    case 'excede': return ptPT.budgetExceeded;
    case 'provavel_dentro': return ptPT.budgetLikely;
    case 'excede_estimado': return ptPT.budgetEstimatedExceeded;
    case 'incerto': return ptPT.budgetUncertain;
    case 'incompleto': return ptPT.budgetIncomplete;
  }
}

function statusReason(reason: string): string {
  const labels: Record<string, string> = {
    alergenio: 'Conflito com um alergénio declarado',
    dieta: 'Incompatível com a regra alimentar',
    produto_indisponivel: 'Sem produto seguro disponível neste supermercado',
    exclusao_texto: 'Inclui um ingrediente indicado para evitar',
    tipo_refeicao: 'Não corresponde ao tipo de refeição',
    sem_candidatos: 'Não existem receitas elegíveis',
    repeticao: 'O limite de duas utilizações por receita foi atingido',
    mesmo_dia: 'A receita já aparece nesse dia',
    locked_invalido: 'Uma refeição bloqueada deixou de ser válida',
    limite_de_nos: 'A pesquisa atingiu o limite de 10 000 tentativas',
  };
  return labels[reason] ?? 'Não foi possível atribuir uma receita segura';
}

function create(profile: UserProfile, seed: number, activeCatalogue: typeof catalogue = catalogue) {
  const now = new Date();
  return createWeeklyPlan(
    profile,
    activeCatalogue,
    todayLocal(),
    `plano-${now.getTime()}-${seed}`,
    now.toISOString(),
    seed,
  );
}

export function PlannerDashboard() {
  const [activeCatalogue, setActiveCatalogue] = useState(catalogue);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [failure, setFailure] = useState<Extract<ReturnType<typeof create>, { ok: false }>['result'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('planning');
  const [peopleInput, setPeopleInput] = useState('');

  useEffect(() => {
    let loaded: Plan | null = null;
    try {
      const savedCatalogue = readSavedCatalogue(readApplicationItem(window.localStorage, 'smartbasket:product-catalogue:v1'), catalogue) ?? catalogue;
      // Load user-managed products before validating a saved plan.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveCatalogue(savedCatalogue);
      loaded = readSavedPlan(readApplicationItem(window.localStorage, PLAN_STORAGE_KEY), savedCatalogue);
      if (!loaded) {
        const wizard = parseWizardSnapshot(readApplicationItem(window.localStorage, WIZARD_DRAFT_KEY));
        const profile = wizard?.completed ? toUserProfile(wizard.draft) : null;
        if (profile) {
          const seed = Number(readApplicationItem(window.localStorage, SEED_STORAGE_KEY) ?? '0');
          const result = create(profile, Number.isSafeInteger(seed) ? seed : 0, savedCatalogue);
          if (result.ok) {
            loaded = result.plan;
            writeApplicationItem(window.localStorage, SEED_STORAGE_KEY, String((Number.isSafeInteger(seed) ? seed : 0) + 1));
          } else {
            // Loading an infeasible generated profile is part of the route bootstrap.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setFailure(result.result);
          }
        }
      }
    } catch {
      // The app can still generate and display a plan if local storage is unavailable.
    }
    if (loaded) {
      setPlan(loaded);
      setPeopleInput(String(loaded.profile.people));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!plan) return;
    try {
      writeApplicationItem(window.localStorage, PLAN_STORAGE_KEY, JSON.stringify(plan));
    } catch {
      // Calculations remain available for this session even if saving fails.
    }
  }, [plan]);

  const today = todayLocal();
  const basket: Basket | null = useMemo(() => plan ? computeBasket(plan, activeCatalogue, today) : null, [plan, activeCatalogue, today]);
  const budgetCents = plan ? toCents(plan.profile.weeklyBudget) : 0;
  const budgetStatus = basket ? getBudgetStatus(basket, budgetCents) : null;
  const regenerate = (profile: UserProfile) => {
    const currentSeed = Number(readApplicationItem(window.localStorage, SEED_STORAGE_KEY) ?? '0');
    const seed = Number.isSafeInteger(currentSeed) ? currentSeed : 0;
    const result = create(profile, seed, activeCatalogue);
    if (result.ok) {
      setPlan(result.plan);
      setFailure(null);
      setPeopleInput(String(profile.people));
      try { writeApplicationItem(window.localStorage, SEED_STORAGE_KEY, String(seed + 1)); } catch { /* Session-only regeneration remains available. */ }
    } else {
      setFailure(result.result);
    }
  };

  if (loading) return <main className="results-shell"><p className="loading-message" role="status">{ptPT.loadingPlan}</p></main>;
  if (!plan || !basket) return <GenerationFailure failure={failure} />;
  const currentBudgetStatus = budgetStatus ?? 'incompleto';

  const changePeople = () => {
    const people = Number(peopleInput);
    if (!Number.isInteger(people) || people < 1 || people > 12) return;
    regenerate({ ...plan.profile, people });
  };
  const togglePurchased = (ingredientId: string) => setPlan((current) => current ? {
    ...current,
    purchased: { ...current.purchased, [ingredientId]: !current.purchased[ingredientId] },
  } : current);

  return (
    <main className="results-shell">
      <header className="results-topbar">
        <a className="brand" href="/" aria-label="SmartBasket — configuração">
          <span className="brand-mark" aria-hidden="true">s</span>
          <span><span className="brand-name">SmartBasket</span><span className="brand-caption">{ptPT.brandLine}</span></span>
        </a>
        <span className="local-badge"><span className="local-dot" aria-hidden="true" />{ptPT.localNotice}</span>
      </header>
      <div className="results-content">
        <div className="results-heading-row">
          <div><div className="eyebrow">{supermarketLabels[plan.profile.supermarketId]} · {ptPT.countDays}</div><h1>{ptPT.planTitle}</h1><p>{ptPT.planDescription}</p></div>
          <span className="people-summary">{plan.profile.people} {ptPT.peopleShort}</span>
        </div>
        <div className={`budget-strip status-${currentBudgetStatus}`} role="status"><span className="status-dot" aria-hidden="true" /><strong>{statusCopy(currentBudgetStatus)}</strong><span>{ptPT.weeklyBudget}: {formatCents(budgetCents)}</span><button type="button" onClick={() => setView('budget')}>{ptPT.tabBudget}</button></div>
        <nav className="result-tabs" aria-label="Secções do plano">
          {(['planning', 'shopping', 'budget'] as const).map((key) => <button key={key} type="button" className={view === key ? 'active' : ''} aria-current={view === key ? 'page' : undefined} onClick={() => setView(key)}>{key === 'planning' ? ptPT.tabPlanning : key === 'shopping' ? ptPT.tabShopping : ptPT.tabBudget}{key === 'shopping' && <span className="tab-count">{basket.lines.length}</span>}</button>)}
        </nav>
        {view === 'planning' && <PlanningView plan={plan} activeCatalogue={activeCatalogue} onRegenerate={() => regenerate(plan.profile)} />}
        {view === 'shopping' && <ShoppingView plan={plan} basket={basket} activeCatalogue={activeCatalogue} onTogglePurchased={togglePurchased} />}
        {view === 'budget' && <BudgetView plan={plan} basket={basket} status={currentBudgetStatus} />}
        {failure && <div className="inline-failure" role="alert">{ptPT.noPlanTitle}<ul>{failure.failingSlots.slice(0, 5).map((slot) => <li key={`${slot.day}-${slot.mealType}`}>{weekdayLabels[slot.day]} · {mealLabels[slot.mealType]}: {slot.reasons.map(statusReason).join('; ')}</li>)}</ul></div>}
        <section className="recalculate-card" aria-label="Recalcular quantidades">
          <div><strong>Atualizar o tamanho do agregado</strong><p>As receitas, quantidades, embalagens e totais serão recalculados a partir do novo número de pessoas.</p></div>
          <label>{ptPT.peopleShort}<select aria-label={ptPT.peopleShort} value={peopleInput} onChange={(event) => setPeopleInput(event.target.value)}>{Array.from({ length: 12 }, (_, index) => index + 1).map((count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <button className="button button-primary" type="button" onClick={changePeople}>{ptPT.recalculate}</button>
          <button className="button button-secondary" type="button" onClick={() => regenerate(plan.profile)}>{ptPT.regenerateWeek}</button>
          <a className="button button-secondary" href="/catalogo">{ptPT.manageProducts}</a>
        </section>
        <p className="results-disclaimer">{ptPT.allergenDisclaimer}</p>
      </div>
    </main>
  );
}

function GenerationFailure({ failure }: { failure: Extract<ReturnType<typeof create>, { ok: false }>['result'] | null }) {
  return <main className="results-shell"><header className="results-topbar"><a className="brand" href="/">SmartBasket</a><a href="/">{ptPT.editAnswers}</a></header><section className="generation-failure"><div className="failure-mark" aria-hidden="true">!</div><h1>{failure ? ptPT.noPlanTitle : ptPT.noProfile}</h1><p>{failure ? ptPT.noPlanDescription : ptPT.noProfile}</p>{failure && <ul>{failure.failingSlots.map((slot) => <li key={`${slot.day}-${slot.mealType}`}><strong>{weekdayLabels[slot.day]} · {mealLabels[slot.mealType]}</strong><span>{slot.reasons.map(statusReason).join('; ')}</span></li>)}</ul>}<a className="button button-primary" href="/">{ptPT.editAnswers}</a></section></main>;
}

function PlanningView({ plan, activeCatalogue, onRegenerate }: { plan: Plan; activeCatalogue: typeof catalogue; onRegenerate: () => void }) {
  return <section className="planning-view" aria-label={ptPT.tabPlanning}>
    <div className="section-heading-row"><div><h2>As refeições da semana</h2><p>Plano de sete dias. Cada receita aparece no máximo duas vezes.</p></div><button className="button button-secondary" type="button" onClick={onRegenerate}>{ptPT.regenerateWeek}</button></div>
    <div className="week-grid">{plan.days.map((day: PlanDay) => <article className="day-card" key={day.day}><header><span>{weekdayLabels[day.day]}</span><small>{day.slots.length} refeições</small></header><div className="day-meals">{day.slots.map((slot) => {
      const recipe = activeCatalogue.recipes.find((entry) => entry.id === slot.recipeId);
      if (!recipe) return null;
      return <a className="meal-card" href={`/plan/refeicao/${recipe.id}`} key={`${slot.mealType}-${slot.recipeId}`}><span className="meal-type-label">{mealLabels[slot.mealType]}</span><strong>{recipe.name}</strong><span className="meal-meta">{recipe.prepMinutes} min · {recipe.baseServings} doses-base</span><span className="meal-open">{ptPT.viewRecipe} <span aria-hidden="true">→</span></span></a>;
    })}</div></article>)}</div>
  </section>;
}

function priceText(selection: ProductSelection): string {
  if (selection.status === 'unavailable') return ptPT.unavailableProduct;
  if (selection.perPackPriceCents === null) return ptPT.unknownPrice;
  return `${priceStateLabels[selection.priceState]} · ${ptPT.packPrice.toLocaleLowerCase('pt-PT')}: ${formatCents(selection.perPackPriceCents)}`;
}

function purchaseText(selection: Extract<ProductSelection, { status: 'selected' }>): string {
  const model = selection.product.sellingModel ?? 'fixed_package';
  if (model === 'variable_weight') {
    return selection.checkoutQuantity === null || selection.checkoutQuantityKnown === false
      ? 'Quantidade final e custo de checkout por confirmar'
      : `Quantidade: ${selection.checkoutQuantity} ${selection.product.unit}`;
  }
  if (model === 'per_unit') return `${selection.checkoutQuantity ?? selection.packs} unidades`;
  return `${selection.packs} × ${selection.product.packSize} ${selection.product.unit}`;
}

function ShoppingView({ plan, basket, activeCatalogue, onTogglePurchased }: { plan: Plan; basket: Basket; activeCatalogue: typeof catalogue; onTogglePurchased: (ingredientId: string) => void }) {
  const ingredients = new Map(activeCatalogue.ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const groups = new Map<string, typeof basket.lines>();
  for (const line of basket.lines) {
    const category = ingredients.get(line.ingredientId)?.category ?? 'despensa';
    groups.set(category, [...(groups.get(category) ?? []), line]);
  }
  const unknownCount = basket.unknownLines.length;
  return <section className="shopping-view" aria-label={ptPT.tabShopping}>
    <div className="section-heading-row"><div><h2>{ptPT.shoppingList}</h2><p>{supermarketLabels[plan.profile.supermarketId]} · quantidades consolidadas para {plan.profile.people} pessoas, durante sete dias.</p></div><span className="shopping-count">{basket.lines.length} ingredientes</span></div>
    {basket.hasUnknown && <div className="honesty-notice"><span aria-hidden="true">i</span><p>{ptPT.productCatalogueNotice} {ptPT.priceCertaintyNote} {unknownCount} {ptPT.priceUnknownCount.toLocaleLowerCase('pt-PT')}.</p></div>}
    {basket.hasUnavailable && <div className="warning-notice" role="alert">{ptPT.noPlanDescription}</div>}
    {([false, true] as const).map((ownedGroup) => {
      const groupLines = [...groups.entries()].flatMap(([category, lines]) => lines.filter((line) => line.owned === ownedGroup).map((line) => ({ category, line })))
        .sort((left, right) => Number(Boolean(plan.purchased[left.line.ingredientId])) - Number(Boolean(plan.purchased[right.line.ingredientId])) || left.line.ingredientName.localeCompare(right.line.ingredientName));
      if (!groupLines.length) return null;
      const byCategory = new Map<string, typeof groupLines>();
      for (const entry of groupLines) byCategory.set(entry.category, [...(byCategory.get(entry.category) ?? []), entry]);
      return <section className="shopping-section" key={String(ownedGroup)}><div className="shopping-section-heading"><h3>{ownedGroup ? ptPT.ownedAtHome : ptPT.toBuy}</h3><span>{groupLines.length}</span></div>{[...byCategory.entries()].map(([category, entries]) => <section className="shopping-group" key={category}><h3>{categoryLabels[category as keyof typeof categoryLabels]}<span>{entries.length}</span></h3><div className="shopping-items">{entries.map(({ line }) => {
      const selection = line.selection;
      const selected = selection.status === 'selected' ? selection : null;
      return <article className={`shopping-item${line.owned ? ' is-owned' : ''}${plan.purchased[line.ingredientId] ? ' is-purchased' : ''}`} key={line.ingredientId}>
        <label className="shopping-check"><input type="checkbox" checked={Boolean(line.owned || plan.purchased[line.ingredientId])} disabled={line.owned} onChange={() => onTogglePurchased(line.ingredientId)} /><span className="sr-only">{plan.purchased[line.ingredientId] ? ptPT.purchased : ptPT.notPurchased}: {line.ingredientName}</span></label>
        <div className="shopping-item-main"><strong>{line.ingredientName}</strong><span>{ptPT.needed}: {line.quantity === null ? 'Quantidade por confirmar' : `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 }).format(line.quantity)} ${line.warnings.length ? '— unidade por confirmar' : selected?.product.unit ?? ''}`}</span>
          {line.warnings.length > 0 && <small className="warning-copy">Conversão de unidade por confirmar.</small>}
          {line.owned ? <span className="owned-pill">{ptPT.ownedAtHome}</span> : selected ? <><span className="product-name">{selected.product.name} · {supermarketLabels[selected.product.supermarketId]}</span><span className={`price-state state-${selected.priceState}`}>{priceText(selected)}</span><span className="pack-line">{purchaseText(selected)}{selected.checkoutCents === null ? ` · ${ptPT.checkoutCost}: ${ptPT.unknownPrice.toLocaleLowerCase('pt-PT')}` : ` · ${ptPT.checkoutCost}: ${formatCents(selected.checkoutCents)}`}</span></> : <span className="unavailable-pill">{ptPT.unavailableProduct}</span>}
        </div>
        {selected?.product.priceUpdatedAt && <time className="updated-date" dateTime={selected.product.priceUpdatedAt}>{new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium' }).format(new Date(selected.product.priceUpdatedAt))}</time>}
      </article>;
      })}</div></section>)}</section>;
    })}
  </section>;
}

function BudgetView({ plan, basket, status }: { plan: Plan; basket: Basket; status: BudgetStatus }) {
  const budgetCents = toCents(plan.profile.weeklyBudget);
  const hasUnknownOrUnavailable = basket.hasUnknown || basket.hasUnavailable || basket.hasUncertainQuantity;
  const budgetDifference = budgetCents - basket.estimatedTotalCents;
  const statusClass = `budget-status-card status-${status}`;
  return <section className="budget-view" aria-label={ptPT.tabBudget}>
    <div className="section-heading-row"><div><h2>Orçamento da semana</h2><p>Baseado na lista gerada e no custo de embalagens inteiras.</p></div><span className={statusClass}>{statusCopy(status)}</span></div>
    <div className="budget-cards">
      <article><span>{ptPT.knownSubtotal}</span><strong>{formatCents(basket.subtotalKnownCents)}</strong><small>{ptPT.knownSubtotalHint}</small></article>
      <article><span>{ptPT.estimateSubtotal}</span><strong>{basket.hasEstimate ? formatCents(basket.estimatedTotalCents - basket.subtotalKnownCents) : '—'}</strong><small>{basket.hasEstimate ? ptPT.estimatedTotalHint : ptPT.noEstimates}</small></article>
      <article><span>{ptPT.weeklyBudget}</span><strong>{formatCents(budgetCents)}</strong><small>{plan.profile.people} pessoas · sete dias</small></article>
      <article className={hasUnknownOrUnavailable ? 'card-incomplete' : ''}><span>{ptPT.estimatedTotal}</span><strong>{hasUnknownOrUnavailable ? '—' : formatCents(basket.estimatedTotalCents)}</strong><small>{hasUnknownOrUnavailable ? ptPT.noTotalPossible : basket.hasEstimate ? ptPT.estimatedTotalHint : 'Total calculado a partir de preços manuais/verificados e embalagens inteiras.'}</small></article>
      <article><span>{ptPT.consumptionReference}</span><strong>{basket.consumptionIncomplete ? '' : formatCents(basket.consumptionTotalCents)}</strong><small>Valor de consumo; não determina o estado do orçamento.</small></article>
    </div>
    {basket.rangeCents && <div className="range-card"><span>{ptPT.estimateRange}</span><strong>{formatCents(basket.rangeCents.low)} – {formatCents(basket.rangeCents.high)}</strong></div>}
    {basket.hasEstimate && <p className="estimate-note">{ptPT.estimatedTotalHint}</p>}
    {basket.unknownLines.length > 0 && <div className="budget-unknowns"><h3>{ptPT.priceUnknownCount}</h3><ul>{basket.unknownLines.map((line) => <li key={line.ingredientId}>{line.ingredientName} — {line.selection.status === 'selected' ? line.selection.product.name : ptPT.unavailableProduct}</li>)}</ul></div>}
    {basket.hasUnavailable && <div className="warning-notice" role="alert">Há ingredientes sem produto compatível; o orçamento permanece incompleto.</div>}
    {!hasUnknownOrUnavailable && <p className="budget-difference">{ptPT.budgetRemaining}: {formatCents(Math.abs(budgetDifference))} {budgetDifference >= 0 ? 'disponíveis' : 'acima do orçamento'}.</p>}
    {!hasUnknownOrUnavailable && <p className="per-person-note">{ptPT.budgetPerPersonDay}: {formatCents(Math.round(basket.estimatedTotalCents / plan.profile.people / 7))}.</p>}
    <div className="honesty-notice"><span aria-hidden="true">i</span><p>{ptPT.productCatalogueNotice} {ptPT.priceNotice} {ptPT.priceCertaintyNote}</p></div>
  </section>;
}
