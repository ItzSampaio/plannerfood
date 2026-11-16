# AGENTS.md — SmartBasket

You are the implementing engineer for **SmartBasket**, a weekly grocery and meal planner for households in Portugal. The product scope is **fixed** (approved spec v1.3 plus two amendments). The full technical specification is in `docs/SPEC.md`. Read it before writing code. If this file and `docs/SPEC.md` disagree, stop and ask the human.

## 1. Mission

Given a supermarket (Continente or Pingo Doce), household size (1–12), meal types, dietary rule, EU-14 allergens, owned pantry items, priority and a **weekly budget**, SmartBasket produces:

- a 7-day meal plan,
- a consolidated shopping list priced by **whole packages**,
- a budget view that is **honest** about price certainty.

It is a client-side app: no accounts, no backend, no paid APIs, no AI APIs, no scraping, no live prices.

## 2. Scope (do not expand without asking the human)

In scope: everything in `docs/SPEC.md`.

**Out of scope. Do not build, stub or hint at these:** user accounts or login, Supabase or any backend, live price feeds, scraping or fetching supermarket sites, AI/LLM calls, leftover or next-day meal reuse, a pantry scoring bonus in meal selection, automatic category-average price estimates, nutrition tracking, delivery or checkout integration, languages other than pt-PT, multi-week plans.

If you think something is missing, write it under "Proposals" in `docs/DECISIONS.md` and ask. Do not implement it.

## 3. Non-negotiable safety rules

These must never be weakened, bypassed, made optional or "temporarily" relaxed, including to make a test pass or fill a plan slot:

1. **Allergens are hard exclusions** everywhere: generation, regeneration, recipe swaps, product selection, user overrides, optimisation, import.
2. **Ingredient-level and product-level allergen data are both checked.** Ingredient-derived safety is necessary but not sufficient.
3. **Unknown allergen information is never proof of safety.** If the user has declared any allergy, an ingredient, recipe or product with `'unknown'` allergens is unsafe.
4. **`isNeutral` applies only to dietary compatibility.** Neutral ingredients (e.g. salt, water) still go through every allergen check at ingredient and product level.
5. **Unknown dietary compatibility is not compatibility.** Only `'compativel'` passes an active diet filter (neutral ingredients are exempt from the *diet* check only).
6. If no safe product exists for an ingredient, mark it **indisponível** and exclude dependent recipes with a visible reason. Never fall back to an unsafe product.
7. Free-text exclusions are supplementary. They never replace or weaken structured allergen filtering.
8. The app never claims to guarantee allergen-free food. The disclaimer in `docs/SPEC.md` §14 must appear in the wizard allergen step and on the results page.
9. When the search node limit is hit, return a failure result. Never relax a hard constraint.
10. All safety checks go through shared functions in `src/lib/safety/`. No UI component or optimiser code may implement its own copy.

## 4. Price honesty rules

1. **Never invent supermarket prices.** Never write a price into the seed data that did not come from the human. Seed products ship with `priceState: 'desconhecido'` unless the human supplies real prices.
2. Never present an estimate or unknown price as confirmed or live.
3. Never count an unknown price as zero.
4. Every displayed price shows its state (Manual / Verificado / Estimativa / Desconhecido), pack size, supermarket and last-updated date (where applicable).
5. "Dentro do orçamento" appears **only** when every non-owned line is Manual or Verificado and the exact total ≤ budget.
6. The budget compares to **checkout cost** (whole packages). **Consumption cost** is a reference figure and is never compared to the budget. Keep the two separate in code, types and UI.
7. All money is computed in **integer cents** internally.

## 5. Language

All user-facing text is **European Portuguese (pt-PT)**, in `src/i18n/pt-PT.ts` and `src/i18n/labels.ts`. Never display raw enum values. Use pt-PT wording ("ecrã", "ficheiro", "guardar", "palavra-passe" style), not Brazilian forms. Currency `€54,30`; dates like `12 nov. 2026` using `Intl` with `pt-PT`.

Code, identifiers, comments and docs are in English. Data enum identifiers are Portuguese-neutral snake_case without accents (e.g. `pequeno_almoco`).

## 6. How to work

1. **Inspect first.** Read the repo, `docs/SPEC.md`, `docs/IMPLEMENTATION_PLAN.md` and `docs/DECISIONS.md` before changing anything.
2. **Plan.** Create/maintain `docs/IMPLEMENTATION_PLAN.md`: phases, status (todo / in progress / done), notes. Update it at the end of every phase.
3. **Work one phase at a time.** Do not start the next phase until the current one's tests pass and acceptance criteria are met.
4. **Real functionality only.** No mock data in the UI, no placeholder buttons, no `TODO` features. Every visible control must work.
5. **Run checks after each phase:** `npm run typecheck && npm run lint && npm test && npm run build`. Fix failures before moving on. Never delete or skip a failing test to proceed; fix the cause or ask the human.
6. **Keep the app runnable** (`npm run dev`) at the end of every phase.
7. **Minimal dependencies.** Allowed: next, react, react-dom, typescript, tailwindcss (+ postcss/autoprefixer as required by the installed version), eslint (+ next config), vitest, @vitejs/plugin-react, jsdom, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, @playwright/test, tsx (to run `scripts/*.ts`). Anything else requires asking the human. No schema libraries, no state libraries, no UI kits. Hand-written validators and `useReducer`/context.
8. **Do not invent APIs or library features.** If unsure of a framework API, read the installed package's docs or types in `node_modules`, or ask.
9. **Determinism.** Engine functions are pure and take their inputs (including `today` and `seed`) as arguments. No `Date.now()` or `Math.random()` inside engines.
10. **Document decisions and assumptions** in `docs/DECISIONS.md` (date, decision, reason). Anything the spec leaves ambiguous goes there as an assumption and is reported to the human.
11. At the end of each phase, reply with a short report: what was built, files changed, test results (counts), unresolved assumptions.

## 7. Commands

```
npm run dev          # local dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest run
npm run test:watch   # vitest
npm run test:e2e     # playwright
npm run validate:data # runs the catalogue validators against src/data/*.json, non-zero exit on error
```

## 8. Code style

TypeScript `strict: true`, no `any` (use `unknown` + narrowing), no non-null assertions in engine code. Functions small and pure; engine code lives in `src/lib/`, React components only render and dispatch. Prefer exhaustive `switch` with a `never` check on enums. Named exports. Tailwind utility classes; shared UI primitives in `src/components/ui/`.

## 9. Definition of done (every phase)

- Typecheck, lint, unit tests and build pass.
- New behaviour has tests; safety-related behaviour has adversarial tests.
- No out-of-scope features, no invented prices, no raw enum values or English text in the UI.
- `docs/IMPLEMENTATION_PLAN.md` and `docs/DECISIONS.md` updated.
- Phase report delivered.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
