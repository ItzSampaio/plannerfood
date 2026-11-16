# SmartBasket — Technical Specification (v1.3 + amendments)

Authoritative for implementation. `AGENTS.md` rules take precedence for safety, scope and workflow.

## 1. Stack

Next.js (App Router, current stable), React, TypeScript strict, Tailwind CSS, Vitest + jsdom + React Testing Library, Playwright (one or two E2E flows). Package manager: npm. Node LTS. No other runtime dependencies. All pages are client-driven; persistence is `localStorage`. Pin exact versions via `package-lock.json` at install time (use the current stable releases; do not guess version numbers from memory).

## 2. Folder structure

```
smartbasket/
  AGENTS.md
  .github/copilot-instructions.md
  docs/ SPEC.md  IMPLEMENTATION_PLAN.md  DECISIONS.md
  scripts/validate-data.ts
  src/
    app/
      layout.tsx  globals.css
      page.tsx                         # landing
      plan/novo/page.tsx               # wizard
      plan/page.tsx                    # results (tabs)
      plan/refeicao/[id]/page.tsx      # recipe detail (id = recipe id)
      definicoes/page.tsx
      sobre-precos/page.tsx
    components/
      ui/        Button Card Chip Input Tabs Checkbox Dialog Badge ProgressBar Disclaimer
      wizard/    WizardShell StepSupermercado StepPessoas StepRefeicoes StepAlimentacao
                 StepAlergenios StepDespensa StepPrioridadeOrcamento WizardSummary
      planner/   WeekPlanner DayCard MealCard RecipeSwapDialog
      shopping/  ShoppingList CategorySection ShoppingItem ProductSwapDialog PriceBadge
      budget/    BudgetDashboard BudgetStatusBanner CostBreakdown OptimiserPanel
    lib/
      types.ts
      money.ts                         # cents helpers, pt-PT formatting
      text.ts                          # normalise (lowercase, strip accents)
      data/      catalogue.ts (loads + validates JSON)  validators.ts
      safety/    allergens.ts  diet.ts  products.ts      # the ONLY safety logic
      calc/      scale.ts units.ts consolidate.ts select-product.ts basket.ts budget-status.ts
      engine/    candidates.ts score.ts assign.ts generate.ts regenerate.ts
      optimiser/ optimise.ts
      storage/   store.ts schema.ts export-import.ts
      state/     plan-context.tsx reducer.ts
    i18n/        pt-PT.ts  labels.ts
    data/        ingredients.json  recipes.json  products.json
  tests/         # mirrors src/lib; fixtures in tests/fixtures (fake prices allowed ONLY here)
  e2e/
```

## 3. Types (`src/lib/types.ts`)

```ts
export const ALLERGENS = ['gluten','crustaceos','ovo','peixe','amendoim','soja','leite',
  'frutos_casca_rija','aipo','mostarda','sesamo','sulfitos','tremoco','moluscos'] as const;
export type Allergen = typeof ALLERGENS[number];
export type AllergenInfo = Allergen[] | 'unknown';

export const DIET_TAGS = ['vegetariana','vegana','sem_gluten','sem_lactose'] as const;
export type DietTag = typeof DIET_TAGS[number];
export type DietStatus = 'compativel' | 'incompativel' | 'desconhecido';
export type DietCompatibility = Record<DietTag, DietStatus>;
export type DietaryRule = DietTag | 'nenhuma';

export type MealType = 'pequeno_almoco' | 'almoco' | 'jantar' | 'lanche';
export type Priority = 'mais_barato' | 'saudavel' | 'rapido' | 'melhor_valor';
export type RecipeTag = 'saudavel' | 'rapido' | 'economica';
export type SupermarketId = 'continente' | 'pingo_doce';
export type Weekday = 'segunda'|'terca'|'quarta'|'quinta'|'sexta'|'sabado'|'domingo';
export type BaseUnit = 'g' | 'ml' | 'un';
export type LooseUnit = 'colher_sopa' | 'colher_cha' | 'chavena' | 'pitada';
export type RecipeUnit = BaseUnit | LooseUnit;
export type IngredientCategory =
  'carne_peixe' | 'laticinios_ovos' | 'frutas_legumes' | 'hidratos' | 'despensa';
export type PriceState = 'manual' | 'verificado' | 'estimativa' | 'desconhecido';

export type Estimate = { value: number; low?: number; high?: number; enteredAt: string };

export type Ingredient = {
  id: string;
  name: string;                               // pt-PT
  category: IngredientCategory;
  baseUnit: BaseUnit;
  allergens: AllergenInfo;                    // 'unknown' allowed, treated as unsafe for allergic users
  dietCompatibility: DietCompatibility;       // explicit for all four tags
  isNeutral: boolean;                         // neutral for DIET only; never allergen-free by implication
  unitConversions?: Partial<Record<LooseUnit, number>>; // loose unit -> amount in baseUnit
};

export type Product = {
  id: string;
  name: string;                               // pt-PT
  supermarketId: SupermarketId;
  ingredientId: string;
  packSize: number;                           // > 0, in ingredient.baseUnit
  unit: BaseUnit;                             // must equal ingredient.baseUnit
  price: number | null;                       // EUR, max 2 decimals
  priceState: PriceState;
  priceUpdatedAt: string | null;              // ISO date; required for manual/verificado
  estimate?: Estimate;
  allergens: AllergenInfo;
  dietCompatibility: DietCompatibility;
  promo?: { price: number; validUntil: string };
};

export type RecipeLine = { ingredientId: string; amount: number; unit: RecipeUnit; optional?: boolean };

export type Recipe = {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;                          // only own/licensed; optional
  mealTypes: MealType[];
  baseServings: number;                       // integer >= 1
  prepMinutes: number;
  tags: RecipeTag[];
  ingredients: RecipeLine[];
  steps: string[];
  declaredAllergens: AllergenInfo;            // validated == derived
  declaredDietCompatibility: DietCompatibility; // validated == derived
};

export type UserProfile = {
  supermarketId: SupermarketId;
  people: number;                             // integer 1..12
  mealTypes: MealType[];                      // >= 1
  dietaryRule: DietaryRule;
  allergens: Allergen[];                      // structured, hard
  exclusionText: string[];                    // supplementary
  ownedIngredientIds: string[];               // explicit opt-in; default []
  priority: Priority;
  weeklyBudget: number;                       // EUR, weekly, refers to estimated CHECKOUT cost
};

export type Slot = { mealType: MealType; recipeId: string; locked: boolean };
export type PlanDay = { day: Weekday; slots: Slot[] };

export type Plan = {
  id: string;
  createdAt: string;
  profile: UserProfile;                       // snapshot
  days: PlanDay[];                            // always 7, Monday..Sunday
  productOverrides: Record<string, string>;   // ingredientId -> productId
  purchased: Record<string, boolean>;         // shopping line key -> checked
};
```

## 4. Catalogue validators (`src/lib/data/validators.ts`)

Pure functions returning `{ ok: true } | { ok: false; errors: ValidationError[] }` (error has `code`, `path`, `message`). `scripts/validate-data.ts` and `catalogue.ts` both call them; the build/test fails on any error.

**Price invariants (exact):**

| priceState | `price` | `estimate` | other |
|---|---|---|---|
| `manual` | numeric (finite, ≥ 0, ≤ 2 decimals) | absent | `priceUpdatedAt` ISO date required |
| `verificado` | numeric | absent | `priceUpdatedAt` required |
| `estimativa` | `null` | present; `estimate.value` numeric; `estimate.enteredAt` present | — |
| `desconhecido` | `null` | absent | — |

- If `estimate.low` or `estimate.high` is provided, **both** must be provided and `low <= value <= high`.
- `promo` only allowed when `priceState` is `manual` or `verificado`; `promo.price` < `price`; `validUntil` ISO date.

**Other rules:**
- Closed enums: unknown enum values fail. IDs unique per collection. Every reference (`ingredientId`) resolves.
- `product.unit === ingredient.baseUnit`; `packSize > 0`.
- `dietCompatibility` has all four keys with valid values (ingredients and products).
- Recipe `declaredAllergens` must equal the derived set (union of ingredient allergens). If any ingredient has `'unknown'`, the recipe must declare `'unknown'`. Both under- and over-declaration are errors.
- Recipe `declaredDietCompatibility` must equal the derived value (§6).
- Product `allergens`: if both product and ingredient allergens are known lists, the product list must be a **superset** of the ingredient list. A product may be `'unknown'` (allowed, but unusable by allergic users).
- Product `dietCompatibility[tag]` may not be `compativel` if the ingredient's is `incompativel`.
- Recipe lines using a `LooseUnit` require a matching `ingredient.unitConversions[unit]` (seed-data rule; at runtime a missing conversion is flagged, see §9).
- Recipe: `baseServings` integer ≥ 1, `amount` > 0, ≥ 1 step, ≥ 1 meal type.
- **Seed rule:** every shipped recipe must have fully known derived allergens (no `'unknown'` ingredient). Every ingredient used by a shipped recipe must have ≥ 1 product per supermarket (products may be `'unknown'`-allergen or `desconhecido`-price; that only affects usability, not validity).

## 5. Allergen safety (`src/lib/safety/allergens.ts`, `products.ts`)

```ts
hasDeclaredAllergy(profile): boolean                  // profile.allergens.length > 0
isAllergenInfoSafe(info: AllergenInfo, profile): boolean
  // profile has no allergens -> true
  // info === 'unknown'       -> false
  // else                     -> intersection with profile.allergens is empty
isIngredientSafe(ingredient, profile): boolean        // isAllergenInfoSafe(ingredient.allergens)
isProductSafe(product, ingredient, profile): boolean  // ingredient safe AND product allergens safe; neutral ingredients are NOT exempt
deriveRecipeAllergens(recipe, ingredients): AllergenInfo
isRecipeAllergenSafe(recipe, ingredients, profile): boolean
safeProductsFor(ingredientId, profile, catalogue): Product[]  // supermarket + allergen safe + diet compatible
isIngredientAvailable(ingredientId, profile, catalogue): boolean // safeProductsFor(...).length > 0
```

Optional recipe ingredients are treated as required for safety (conservative). Allergen safety does not depend on pantry ownership: an owned ingredient still needs a safe ingredient record and an available safe product.

Free-text exclusions: normalise (`text.ts`) both sides; a recipe is excluded if its name or any ingredient name contains an exclusion term. This is an extra filter only.

## 6. Dietary compatibility (`src/lib/safety/diet.ts`)

Tags are **compatibility rules** (explicitly tagged, never assumed):
- `vegetariana`: no meat, poultry, fish or seafood.
- `vegana`: no animal-derived ingredients (meat, fish, dairy, eggs, honey, etc.).
- `sem_gluten`: no gluten-containing ingredients.
- `sem_lactose`: no lactose-containing ingredients.

```ts
deriveRecipeDiet(recipe, ingredients): DietCompatibility
  // per tag, ignoring ingredients with isNeutral === true:
  //   any 'incompativel'      -> 'incompativel'
  //   else any 'desconhecido' -> 'desconhecido'
  //   else                    -> 'compativel'
isDietOk(status, rule): rule === 'nenhuma' || status === 'compativel'
isProductDietOk(product, ingredient, rule):
  // rule 'nenhuma' -> true
  // ingredient.isNeutral -> true   (neutral for DIET only)
  // else product.dietCompatibility[rule] === 'compativel' (and ingredient's is compativel)
```
Unknown never passes. Neutral ingredients proposed: sal, água, pimenta, vinagre simples (confirm each is tagged compatible in data; `isNeutral` is data, not hard-coded).

## 7. Labels (`src/i18n/labels.ts`)

Separate from enum ids. One map per enum; code never prints raw ids.

Allergens: gluten → "Cereais que contêm glúten"; crustaceos → "Crustáceos"; ovo → "Ovos"; peixe → "Peixe"; amendoim → "Amendoins"; soja → "Soja"; leite → "Leite (incluindo lactose)"; frutos_casca_rija → "Frutos de casca rija"; aipo → "Aipo"; mostarda → "Mostarda"; sesamo → "Sementes de sésamo"; sulfitos → "Dióxido de enxofre e sulfitos"; tremoco → "Tremoço"; moluscos → "Moluscos".

Diets: vegetariana "Vegetariana", vegana "Vegana", sem_gluten "Sem glúten", sem_lactose "Sem lactose", nenhuma "Sem restrições".
Meals: pequeno_almoco "Pequeno-almoço", almoco "Almoço", jantar "Jantar", lanche "Lanches".
Priorities: mais_barato "Mais barato possível", saudavel "Saudável e equilibrado", rapido "Rápido e fácil", melhor_valor "Melhor relação qualidade-preço".
Weekdays: Segunda-feira … Domingo. Price states: manual "Manual", verificado "Verificado", estimativa "Estimativa", desconhecido "Sem preço".
Categories: carne_peixe "Carne, peixe e proteína", laticinios_ovos "Laticínios e ovos", frutas_legumes "Fruta e legumes", hidratos "Hidratos de carbono", despensa "Despensa".
Supermarkets: "Continente", "Pingo Doce".

## 8. Product selection (`src/lib/calc/select-product.ts`)

For each consolidated ingredient need (in base units):
1. Candidates = `safeProductsFor` (supermarket, allergen-safe incl. unknown→unsafe, diet-compatible). Safety filters run **before** any price comparison.
2. If a user override exists: validate it passes step 1; if not, **reject** (reducer refuses and shows an error; if loaded from storage/import, drop the override and report).
3. For each candidate compute `packs = ceil(need / packSize)` and per-pack price: `manual/verificado` → `promo.price` if `promo.validUntil >= today` and cheaper, else `price`; `estimativa` → `estimate.value`; `desconhecido` → none.
4. Rank: price tier first (manual/verificado < estimativa < desconhecido), then lowest checkout cost after rounding (`packs × perPackPrice`), then product id ascending.
5. No candidates → line is `indisponivel`.

## 9. Calculation engine (`src/lib/calc/`)

Pure function `computeBasket(plan, catalogue, today): Basket`.

1. **Scale** each recipe line: `amount × people / baseServings`. (Optional lines are included.)
2. **Convert** to base units. `LooseUnit` uses `ingredient.unitConversions[unit]`; if missing, the line is flagged `quantityUncertain`, excluded from the need, and a warning is shown. Never guess.
3. **Consolidate** by `ingredientId` across all slots (including repeated recipes).
4. **Owned:** ingredients in `profile.ownedIngredientIds` have checkout cost 0 (still listed, marked "Já tenho"). Default is empty.
5. **Select product** (§8), compute `packs` and line checkout (cents).
6. **Consumption cost (reference only):** `need / packSize × perPackPrice` using the same selected product (owned items included; unknown price → `null`, never 0).
7. **Line states:** each line carries `priceState` of its selected product (or `indisponivel`).

Basket totals (all cents, kept separate):
- `subtotalKnownCents`: sum of checkout of non-owned lines with `manual`/`verificado`.
- `estimatedTotalCents`: `subtotalKnownCents` + checkout of `estimativa` lines (using `estimate.value`).
- `unknownLines[]`: non-owned lines with `desconhecido` price; listed by name, **not summed**.
- `rangeCents`: `{ low, high }` **only if** there is ≥ 1 `estimativa` line, **every** `estimativa` line has `low` and `high`, and there are **no** unknown lines. Then `low = subtotalKnown + Σ packs×low`, `high = subtotalKnown + Σ packs×high`. Otherwise `null`. Never claim a finite upper bound when any unknown line exists.
- `consumptionTotalCents` (reference), `consumptionIncomplete: boolean`.
- Flags: `hasEstimate`, `hasUnknown`, `hasUnavailable`, `hasUncertainQuantity`.

Budget comparison uses checkout figures only. `remainingCents = budgetCents − estimatedTotalCents` (shown with its label; if `hasUnknown`, shown as "incompleto").

## 10. Budget status (`src/lib/calc/budget-status.ts`)

```ts
type BudgetStatus = 'dentro' | 'excede' | 'provavel_dentro' | 'excede_estimado'
                  | 'incerto' | 'incompleto';
```
Order of evaluation:
1. `hasUnknown || hasUnavailable || hasUncertainQuantity` → `incompleto` ("Total incompleto: N produtos sem preço" + list). Never confirmed.
2. `hasEstimate`:
   - range exists and `low <= budget < high` (straddles) → `incerto` ("Pode ou não ficar dentro do orçamento");
   - else `estimatedTotal <= budget` → `provavel_dentro` ("Provável dentro do orçamento (inclui estimativas)");
   - else → `excede_estimado` ("Excede o orçamento (inclui estimativas)").
3. Otherwise (all known): `total <= budget` → `dentro` ("Dentro do orçamento"); else `excede` ("Excede o orçamento em €X,XX").

"Dentro do orçamento" is returned **only** by branch 3. Property-test this.

## 11. Meal generation (`src/lib/engine/`)

**Slots:** 7 days × `profile.mealTypes`. Each slot has a candidate set.

**Hard filters (in `candidates.ts`, via `src/lib/safety`):** meal type matches; `isDietOk(deriveRecipeDiet)`; `isRecipeAllergenSafe`; every non-neutral and neutral ingredient `isIngredientAvailable` (safe, diet-compatible product at the chosen supermarket); free-text exclusions; recipe not excluded for another reason. Record a **reason** for each excluded recipe (`alergenio`, `dieta`, `produto_indisponivel`, `exclusao_texto`) for display.

**Soft scoring (`score.ts`, deterministic):** `mais_barato` → lower estimated consumption cost per serving (unknown price: neutral penalty); `saudavel` → +bonus for tag `saudavel`; `rapido` → lower `prepMinutes`; `melhor_valor` → blend of cost rank and tag bonus. Repeat penalty. **No pantry bonus.** Tie-break: score desc, then recipe id asc, then a seeded perturbation (`seed` argument, default 0; implement a small seeded PRNG such as mulberry32 inside the module, no `Math.random`).

**Assignment (`assign.ts`) — backtracking CSP:**
- Constraints: each recipe ≤ 2 uses per week; the same recipe not twice on the same day; locked slots are fixed and counted.
- Variable ordering: most-constrained-first (fewest remaining candidates, ties by day/meal order). Value ordering: score then id.
- Forward checking: after each assignment, recompute remaining candidate counts; if any open slot reaches 0, backtrack immediately.
- Node counter increments on every assignment attempt. Limit `MAX_SEARCH_NODES = 10_000` in one exported, configurable constant (param override for tests/benchmarks).
- Result: `{ ok: true, days, nodesUsed }` or `{ ok: false, reason: 'sem_candidatos' | 'limite_de_nos', failingSlots: {day, mealType, reasons[]}[], nodesUsed }`. **Never relax constraints.** UI message: "Não foi possível preencher o plano com estas regras."
- Fully deterministic for the same input + seed.

**Regenerate:** `regenerateSlot` (exclude the current recipe, same constraints) and `regenerateWeek` (keep locked, new `seed`). **Recipe swap by user:** only recipes passing all hard filters are offered; re-validated on commit.

## 12. Optimiser (`src/lib/optimiser/optimise.ts`)

Input: plan, catalogue, today. Output: `{ plan, actions[], before, after, outcome }`. Runs only on request. Every candidate action is validated with the **same** shared safety functions before being applied; if validation fails the action is discarded.

1. **Step A: cheaper products.** For each non-owned line without a user override, consider other safe, diet-compatible products for the same ingredient whose **checkout cost after rounding** is lower and whose price tier is **not less certain** than the current one (never swap a known price for an estimate/unknown). Apply the largest saving, recompute, repeat.
2. **Step B: cheaper recipes.** For each unlocked slot, consider recipes passing **all** hard filters (including product availability) and the repeat caps; evaluate by recomputing the **whole consolidated basket**; apply the largest total saving, repeat. Locked slots are never changed.
3. **Step C: re-check.** Recompute the basket and budget status. Stop when `estimatedTotal <= budget`, no improving action exists, or after `MAX_OPTIMISER_STEPS = 50`.
- User product overrides are left as set; the report mentions them if they are a top cost driver.
- Output includes a log, e.g. "Trocado «Arroz agulha 1 kg» por «Arroz carolino 1 kg»: −€0,40", before/after totals, and the top 3 cost drivers if still over budget.
- Outcome wording uses §10 status. Never say the budget is achieved unless the status is `dentro`. If only an estimated total fits: "O total estimado ficou dentro do orçamento, mas inclui estimativas."

## 13. Persistence, export/import (`src/lib/storage/`)

- Key `smartbasket:v1` holds `{ schemaVersion: 1, profile, plan, savedAt }`. Reads and writes are wrapped in try/catch; storage may be unavailable, full or corrupted. Corrupt or invalid data is ignored (never crashes), and the UI says "Não foi possível carregar o plano guardado."
- Load-time **revalidation** (also for import): schema shape; every `recipeId` exists in the catalogue; every recipe passes allergen, diet, availability and exclusion checks for the stored profile; overrides pass `isProductSafe`; profile fields in range (people 1–12, budget > 0, ≥ 1 meal type). If any plan recipe violates safety, **reject the plan** with an explanation; never silently keep it.
- Export: downloads `smartbasket-plano-AAAA-MM-DD.json` `{ app: 'smartbasket', schemaVersion: 1, exportedAt, data }`. Import: parse, validate (above), preview summary, require confirmation before overwriting.
- Definições: edit pantry (ownership), diet, allergens, export, import, apagar dados (with confirmation). Changing allergens/diet/supermarket/people triggers regeneration of affected slots or the week; a changed profile never leaves an unsafe plan displayed.
- Hydration safe: read `localStorage` only in effects; render a skeleton first.

## 14. Pages, components and copy (pt-PT)

All strings in `src/i18n/pt-PT.ts`. Suggested copy (agent may refine wording, keeping meaning):

**Disclaimer (component `Disclaimer`, shown in wizard allergen step and on results):** "O SmartBasket é uma ferramenta de apoio à filtragem com base nos alergénios declarados. Não garante a ausência de alergénios. Pode haver contaminação cruzada nos produtos e nas cozinhas. Leia sempre os rótulos e, em caso de alergia grave, não confie apenas nesta aplicação."

**`/` Landing:** headline "Planeie a semana. Gaste menos no supermercado.", CTA "Criar o meu plano", three value cards (plano, lista, orçamento), note "Os preços são introduzidos manualmente e podem estar desatualizados. Nunca são preços em tempo real."

**`/plan/novo` Wizard** (one question per screen, progress bar, sticky Back/Next on mobile, state kept in reducer + saved draft):
1. Supermercado: two large cards.
2. Pessoas: segmented 1–4 + "5 ou mais" → reveals numeric input 5–12 (required, no default, validated).
3. Refeições: multi-select chips, ≥ 1.
4. Alimentação: radio cards (Sem restrições, Vegetariana, Vegana, Sem glúten, Sem lactose).
5. Alergénios e despensa: EU-14 chips with official pt-PT labels; optional free-text field labelled as complementary; disclaimer; pantry checklist grouped, **all unticked**, with text "Marque apenas o que já tem em casa."
6. Prioridade e orçamento: radio cards; € input (min 10, max 1000, comma decimals accepted); helper "O orçamento semanal refere-se ao custo estimado na caixa, com embalagens inteiras."
Final summary → "Gerar o meu plano". On failure show failing slots with reasons and offer to change **preferences** (meal types, priority, supermarket) only, never allergen or diet rules via a "relax" option.

**`/plan` Results** (tabs: "Planeamento", "Lista de compras", "Orçamento"; sticky budget bar showing status text, not just colour):
- Planeamento: 7 days; mobile = accordions/day cards, desktop = grid. MealCard: image or placeholder, name, time, consumption-cost note, actions: Ver receita, Trocar, Regenerar, Bloquear/Desbloquear. "Regenerar semana" keeps locked slots.
- Lista de compras: grouped by category; each row: checkbox, product, quantity needed, packs × pack size, supermarket, line checkout price with `PriceBadge` (state + date), "Já tenho" marker, "Trocar produto" (only safe alternatives; explains if none). Checked rows move down. Unavailable/uncertain lines shown with a clear warning.
- Orçamento: cards: **Subtotal com preços conhecidos**, **Total estimado** (label "inclui estimativas" when applicable), **Intervalo** (only when computable), **Produtos sem preço** (list), **Custo de consumo (referência)**, Orçamento semanal, Restante, Custo por pessoa, Custo por dia (per-person/day computed on `estimatedTotal`, labelled incomplete if `hasUnknown`), `BudgetStatusBanner`, "Otimizar" with action log.
- Disclaimer visible on the page.

**`/plan/refeicao/[id]`:** recipe name, description, servings = people, scaled ingredients (loose units shown as converted + original), steps, per-ingredient allergen labels, consumption cost note.
**`/definicoes`:** see §13. **`/sobre-precos`:** explains the four price states, that prices are entered manually, last-updated dates, that nothing is live, supermarket names are trademarks of their owners, no affiliation.

## 15. Design, responsiveness, accessibility

Premium minimalist consumer look (Linear/Notion/Apple-like): warm off-white background, dark text, one green accent, generous spacing, rounded cards (e.g. `rounded-2xl`), subtle shadows, smooth but restrained transitions (respect `prefers-reduced-motion`). A single type scale and spacing scale; reusable `ui/` primitives. Mobile-first (start at ~360 px), sticky bottom action bars on mobile, ≥ 44 px touch targets, tablet and desktop grids. Accessibility: WCAG AA contrast, visible focus rings, semantic HTML, labelled inputs, `aria-live` for status changes, status never conveyed by colour alone, keyboard operable dialogs. Food imagery: `imageUrl` optional; when absent render an attractive CSS placeholder (soft gradient + category icon). Do not hotlink or bundle images without a licence.

## 16. Seed dataset rules

- Target: ~40 ingredients, **≥ 30 recipes**, and **≥ 1 product per ingredient per supermarket** (2 where sensible, to allow product swaps). Recipes must cover all four meal types and make vegetarian, vegana, sem_glúten and sem_lactose plans feasible for all seven days.
- Recipes are everyday Portuguese-style dishes; allergens and diet tags are derived from ingredients, never guessed in the recipe.
- Products are **generic catalogue entries** with pt-PT names and plausible pack sizes (e.g. "Arroz agulha 1 kg") **to be verified by the human against the supermarket websites**. They are not claimed to be real listings.
- **All seed prices ship as `desconhecido` (price null, no estimate).** The agent must not invent prices. The human fills in real prices (`manual` + `priceUpdatedAt`) directly in `products.json`.
- **Allergen conservatism:** for any processed or branded-type product whose allergens cannot be known from the generic definition, use `'unknown'`. Only mark a product's allergens as a known list when the generic definition makes it certain (e.g. fresh vegetables, plain rice, eggs). Mark dietary compatibility `desconhecido` when not certain.
- Add `docs/DATA_GUIDE.md`: how to add a product/recipe, how to enter a manual price and date, how to run `npm run validate:data`, and a warning that allergen and diet data must be checked against product labels before launch.
- Tests may use fixtures with **fake prices only inside `tests/fixtures/`**, clearly named (e.g. `FAKE_`), never imported by app code.

## 17. Testing matrix

Property-style tests use a seeded PRNG loop (no extra dependency); ≥ 200 seeded iterations each.

**Validators:** each price invariant (valid and invalid cases for all four states, partial `low`/`high`, `low > value`); declared vs derived allergens (under/over-declaration, `'unknown'` propagation); diet derivation incl. neutral ingredients and `desconhecido`; product ⊇ ingredient allergens; enum and reference errors; the shipped seed passes validation.

**Safety:** generated plans never contain recipes with derived or product-level allergen overlap; products with `'unknown'` allergens never selected for allergic users; ingredient with no compatible product → `indisponivel` and recipes excluded with reason; unsafe override rejected; **neutral ingredient with an allergen (e.g. a "sal com aipo") is still excluded for a celery-allergic user; neutral ingredient with `'unknown'` allergens is unsafe for allergic users**; removing a free-text exclusion never re-admits an allergen-violating recipe; every optimiser action and every regenerate/swap/import re-checks safety and diet (adversarial fixtures: cheaper product containing an allergen, cheaper recipe violating a diet, cheaper product with `'unknown'` allergens).

**Diet:** salt and water do not invalidate a vegan recipe; ingredient with `desconhecido` fails an active diet; product with `desconhecido` fails an active diet (non-neutral).

**Calculation:** pack rounding (300 g, 1 kg pack → 1 pack at full price); consolidation across recipes; owned excluded from checkout but included in consumption; fresh profile excludes nothing; unknown never zero and listed separately; subtotal contains only manual/verificado; range only when all estimate lines have bounds and no unknowns; no finite upper bound with unknown lines; promo only when valid on `today`; unconvertible loose unit flagged; selection ranks safety → price tier → checkout cost → id.

**Properties:** `subtotalKnown ≤ estimatedTotal`; when a range exists `low ≤ estimatedTotal ≤ high`; checkout total equals the sum of line checkouts per state group; marking an item owned never increases checkout; adding a non-owned ingredient never decreases `estimatedTotal`; consumption scales linearly with `people` (for lines with known prices); **"dentro" never returned when any estimate/unknown/unavailable line exists or total > budget**; consumption and checkout figures are never interchanged (budget status unchanged when only consumption changes).

**Search:** infeasible fixture → failure object, no partial plan; feasible-with-backtracking fixture succeeds ≤ 10,000 nodes; determinism (same input + seed → identical output); locked slots preserved; benchmark script `scripts/bench-search.ts` on a realistic (~30 recipes) and a stress dataset, reporting nodes/time (report before changing the limit).

**Storage/import:** round trip; corrupted JSON ignored; import with unsafe recipe, unknown recipe id, or unsafe override rejected; schema version mismatch handled.

**Components:** wizard validation (people 5–12 exact input required, ≥ 1 meal, budget range), pantry default unticked, disclaimer present, status wording per state, price badge per state, no raw enum ids rendered (test by scanning rendered text for known ids). **E2E (Playwright):** wizard → results → tick purchased → reload → state persists; allergen-selected flow shows no violating recipe; export then import.
