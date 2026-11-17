# Decisions and open questions

## 2026-11-16 — Workspace audit

The supplied workspace initially contained only the two specification files. The project scaffolding and initial plan were created during the previous turn before the Phase 0-only instruction arrived. No application source files were created. Dependencies have now been installed and locked; see the Phase 0 report for check results.

## 2026-11-16 — Product override safety

Every product override must pass both `isProductSafe()` and `isProductDietOk()`, and belong to the profile's selected supermarket. The first checks ingredient-level and product-level allergens; the second checks ingredient-level and product-level dietary compatibility against the active dietary rule. Apply these checks to manual overrides, stored plans, imports, recipe swaps, and optimiser actions. Keep the checks in `src/lib/safety/` and cover both rejection directions with adversarial tests. This preserves the spec's hard allergen exclusions, explicit diet compatibility requirements, and selected-supermarket constraint at every entry point.

## 2026-11-16 — Neutral ingredient diet handling

For product selection, a neutral ingredient bypasses only its ingredient-level dietary compatibility check. The selected product must still be explicitly compatible with the active dietary rule. Both ingredient-level and product-level allergen checks always apply. The catalogue validator does not force a neutral product's dietary status to mirror an ingredient-level incompatible status, because the ingredient check is exempt; it still validates product values. This follows the user's Phase 1 clarification and narrows the neutral shortcut in the example in `docs/SPEC.md` section 6 so a product-level restriction cannot be bypassed.

## 2026-11-16 — Recipe preparation duration

`prepMinutes` represents approximate total elapsed preparation and cooking time, including overnight soaking where required. Dry chickpea and black-bean recipes therefore show about 13 hours, including soak and cook time, rather than understating the elapsed duration. The specification does not define whether passive soaking time is included; this interpretation keeps the displayed duration honest.

## 2026-11-16 — Runtime validation and recipe plausibility

Runtime catalogue validation enforces only objective structural and data-integrity requirements in `docs/SPEC.md`, including positive amounts, valid references and units, non-empty recipe steps, and allergen/diet compatibility consistency. Recipe plausibility (such as whether a quantity or preparation method is realistic) remains a curated seed-data quality responsibility, covered by the existing recipe review and tests. Runtime validation must not add arbitrary quantity thresholds or subjective text-matching rules that could reject valid recipes. This keeps reusable validation deterministic and spec-based without weakening seed review.

## 2026-11-16 — Calculation audit money handling

Money conversion accepts only non-negative amounts with at most two decimal places and rejects values outside JavaScript's safe integer-cent range. This prevents malformed monetary values from being silently rounded. Checkout prices remain exact integer cents; proportional consumption costs are rounded to the nearest cent directly from pack-price cents and are never used for budget status.

## 2026-11-16 — Meal generation scoring and ingredient scaling

Meal generation estimates recipe cost through the Phase 2 basket calculation with pantry ownership cleared, so owning an ingredient cannot affect recipe selection. Unknown consumption prices remain incomplete and rank behind known costs; they are not replaced by invented price estimates. Recipe quantities continue to use the specification's proportional `amount × people / baseServings` scaling, including egg quantities. No separate non-linear egg rounding rule is defined in the specification or prior decisions, so the engine does not invent one.

## 2026-11-16 — Optimiser certainty and product-selection overlap

Recipe-swap optimisation may proceed only when each non-owned ingredient's price certainty is unchanged or improved; it compares whole-basket checkout costs and reuses the generation safety checks. The product-saving pass is retained, but under the current Phase 2 selector it normally has no eligible saving: automatic selection already chooses the lowest whole-package checkout cost in the highest available certainty tier, while user overrides are intentionally left unchanged. The optimiser must not weaken those guarantees just to produce a product action.

## 2026-11-16 — Approved phase order and parked optimiser work

The agreed phase order is Phase 4 setup wizard, Phase 5 results dashboard and shopping list, and Phase 6 optimiser and swaps. Existing optimiser source and tests remain untouched as preliminary work; their presence is not approval to integrate or expand Phase 6. Phase 4 must stop at a completed setup profile and must not implement results or shopping views.

## 2026-11-16 — Local wizard draft and Windows demonstration

Wizard answers are stored as a versioned draft in browser local storage on the same device. Malformed drafts are ignored and the wizard can be restarted. The demonstration runs entirely on localhost without hosting, accounts, or live price requests. For a different Windows laptop, use the committed lockfile and run `npm ci` on that laptop before the presentation; after dependencies are installed, the local development server needs no network connection.

## 2026-11-16 — Toolchain compatibility pins

Use ESLint 9.39.5 and TypeScript 6.0.3 with the selected Next.js toolchain. The newest registry releases were ESLint 10 and TypeScript 7, but the installed Next lint plugins and TypeScript ESLint parser declare peer ranges that exclude those majors. Choosing the newest versions inside those supported ranges avoids known peer conflicts while keeping exact reproducible versions in the lockfile.

## Other audit notes

- The complete specification is moved to `docs/SPEC.md`, matching the agent instructions and the specified repository structure.
- The App Router, setup wizard, and Phase 5 planner and recipe routes are present; Phase 6 user flows remain unimplemented.
- Seed prices must remain unknown unless real prices are supplied by the human.
- The seed contains 40 ingredients, 32 recipes, and 80 generic products. Each of the four dietary rules has at least seven product-available recipes for each meal type at both supermarkets.
- Generic bread and cheese entries use unknown product allergens and conservative unknown ingredient/product dietary statuses where the generic description cannot establish compatibility; affected recipe diet declarations are derived from those statuses.
- The production build passes with the App Router shell and Phase 5 routes.

## Proposals

None.

## 2026-11-17 — Pricing integration recovery blocker

The repository contains Scrapling and Cesta MCP integrations, including UI approval flows and tests. They cannot be marked compliant with the approved scope: `AGENTS.md` and `docs/SPEC.md` prohibit scraping, live price feeds, supermarket fetching and required network services. Scrapling also contains hard-coded fallback retailer prices and returns them when a fetch fails. Cesta has no postcode or branch selector, so it cannot establish local availability. No integration was deleted or silently replaced during recovery. Decide whether to remove/disable external fetching and retain local human-entered/imported prices, or amend the specification before implementation continues.


## 2026-11-16 — Phase 5 real calculation integration

The results route composes the shipped recipe catalogue and Phase 3 generation engine with Phase 2 scaling, consolidation, product selection, basket, and budget-status functions. The generated Plan and purchased checks are saved locally so refreshes preserve the displayed plan and list. Starting generation from the wizard invalidates the previous plan snapshot, ensuring current preferences produce fresh results. Recipe detail routes revalidate each scheduled recipe against the active profile before showing ingredients or steps. Product records remain generic and unverified; because all shipped prices are unknown, the budget is explicitly incomplete, the unknown-price products are listed, and no finite total is presented. Phase 6 optimiser work remains parked and was not modified.

## 2026-11-16 — Phase 6 local product catalogue and price maintenance

The current Phase 6 authorization is for maintaining a product catalogue and prices, not optimiser work. Product records can be edited, added, imported and exported in the browser; the user's catalogue is local to that browser and feeds the existing validated product-selection and Phase 2 basket paths. Optimiser functionality remains parked and untouched until separately authorized. This updates the earlier phase-order note that described Phase 6 as optimiser and swaps.

The pricing integration budget is €0. Do not subscribe to, call, or depend on Bourmet, ReefAPI, or any paid service. Do not scrape retailer pages or call a source without permission to use it. Shipped generic prices remain unknown. A manually entered price is user-supplied; a price may be marked verified only after explicit user attestation that the source was checked and an observation date is recorded. Estimates and unknown prices remain separate states. Price changes are retained as local history; user imports/exports are the update mechanism, so changing source code is not needed for routine updates.

Open Prices / Open Food Facts is an optional public, crowdsourced research lead, not a dependency or proof of current price. Its ODbL terms require attribution/share-alike obligations, and the available observations can be sparse or stale. Open Food Facts also warns volunteered product data can be incomplete or inaccurate. No third-party data is automatically imported into or marked verified in the app. A human must inspect each product and price and follow the source license before use. Retailer-specific product assignment and URLs are user-entered; no listing is claimed verified by this project.

## 2026-11-17 — External pricing disabled

Scrapling and Cesta integration code is retained as quarantined reference, but all runtime external calls are disabled. The Scrapling route and worker return an explicit disabled error and never emit observations; Cesta's network boundary throws before any request. The catalogue exposes local manual entry and validated CSV/JSON import/export only. Manual and imported prices remain distinct from verified retailer prices.
