# SmartBasket implementation plan

## Phase 0 â€” Repository and specification audit

Status: done

- Inspect the repository, `AGENTS.md`, and `SPEC.md` before application work.
- Check project configuration and run the required checks where possible.
- Record missing requirements, contradictions, and open technical questions.
- Do not implement product features in this phase.

Notes: The product override safety decision is recorded in `docs/DECISIONS.md`. The complete specification is at `docs/SPEC.md`. Dependencies are installed and locked. Typecheck passed and lint exited successfully. Tests, build, and data validation were attempted but cannot complete until their Phase 1 source files exist. No application code was added in Phase 0.

## Phase 1 â€” Types, catalogue, safety, and seed data

Status: done

- Define the TypeScript domain types and pt-PT labels.
- Implement shared allergen and dietary safety functions and catalogue validators.
- Add a generic seed catalogue and data guide; keep every seed price unknown.
- Add adversarial safety tests and run typecheck, lint, unit tests, and data validation.

Notes: Implemented 40 ingredients, 32 individually reviewed recipes, and 80 generic product records with all prices unknown. Each diet has at least seven product-available recipes for each meal type at both supermarkets. The coverage audit added 30 tests, including seeded 200-iteration validator properties, full recipe quantity/step/declaration review, and unknown-safety paths. Typecheck, lint, tests, and `validate:data` pass. `next build` remains unavailable without an app route; creating UI pages is explicitly outside this phase.

## Phase 2 â€” Calculation engine

Status: done

- Implemented pure unit conversion, scaling, ingredient consolidation, safe product selection, basket calculations, money helpers, and budget status.
- Added calculation tests for cents precision, zero prices, partial packages, estimates, unknowns, unavailable and owned items, rejected overrides, promotions, exact budget equality, and consumption/budget separation; the seeded money property runs 200 iterations.
- Recorded the boundary: recipe plausibility remains in curated seed review/tests; runtime validators enforce objective specification rules only.
- Final correctness audit passed. Phase 2 was formally approved before meal generation work began. Build still requires an `app` or `pages` route, outside the authorized engine work.

## Phase 3 — Meal generation engine

Status: done

- Added hard-filtered candidates, deterministic priority scoring, greedy assignment with most-constrained-first backtracking and forward checking, a 10,000-node limit, week/slot regeneration, and safe swap validation.
- Candidate checks use the shared allergen, diet, product-availability, and text-normalization helpers. Recipe costs reuse the Phase 2 basket engine with pantry ownership cleared.
- Preserved proportional quantity scaling from Phase 2; no undocumented egg rounding was introduced.
- Added adversarial coverage for meal types, all diet modes, allergen and product conflicts, exclusions, unavailable ingredients, priorities, pantry independence, repeats, infeasibility, node limit, locked slots, swaps, and 200 seeded determinism iterations.
- `npm run typecheck`, `npm run lint`, `npm test` (70 tests), and `npm run validate:data` pass. Search benchmark: realistic seed 36 nodes (21.12 ms); 4x stress catalogue 36 nodes (18.71 ms). Phase 3 is complete.
## Phase 4 — Setup wizard

Status: done

- Build a responsive pt-PT setup wizard with household, supermarket, meal, dietary, allergen, pantry, priority, and budget inputs.
- Validate required answers, preserve allergen/diet hard rules, and save/resume a local wizard draft.
- Phase 4 was limited to setup preferences and the local profile handoff.


## Phase 5 — Results dashboard and shopping list

Status: done

- Composed the Phase 3 `generateWeek` engine with a persisted Plan and the real Phase 1 catalogue; failed searches show affected slots and reasons without relaxing safety.
- Results use Phase 2 quantity consolidation, selected-supermarket product safety, whole-package checkout calculations, pantry ownership, and budget-status logic.
- Added week planning, interactive recipe details, grouped buy/owned shopping lists with persisted purchased checks, budget certainty breakdown, and household-size recalculation.
- Seed product prices remain unknown; the interface explicitly labels generic unverified catalogue entries and never presents unknown prices as zero or a complete total.

Notes: Typecheck, lint, all 82 tests, catalogue validation, and the production build pass. Playwright Chromium end-to-end flow (1 test) passes. Integration tests complete the wizard-to-plan flow, verify seven safe generated days and recipe detail contents, check shopping/budget outputs, persist a purchase through reload, and recalculate for a changed household. A catalogue matrix also generates all four meal types together for every dietary mode at both supermarkets. Phase 6 remains not started.

## Phase 6 — Local product catalogue and free price maintenance

Status: in progress — live Cesta MCP product refresh is unfinished

- Provide local browser-based product editing for both supermarkets, including product identity, brand, package size, ingredient match, URL, barcode, safety data, price state and observation date.
- Import/export product records in CSV and JSON; merge by stable product ID and validate before applying.
- Preserve price state and price history without inventing prices or silently changing unknown values.
- Feed saved products to the existing shared safety/product-selection and Phase 2 basket calculation paths.
- No paid API, external pricing subscription, unauthorized scraping, or required network service. Open Prices/Open Food Facts is an optional crowdsourced research lead with license and freshness limitations, not an automatic verified data source.
- Optimiser and swaps remain parked. Existing `src/lib/optimiser/optimise.ts` and its tests are not expanded or integrated by this phase.

Notes: The `/catalogo` local product manager, CSV/JSON import/export, history, and Phase 2 integration existed before this checkpoint. Investigated Cesta.pt's documented MCP interface, Open Prices API and Open Food Facts API. Confirmed live Cesta MCP search/detail retrieval on 2026-11-16 and added two matched, same-day rice listings (Continente and Pingo Doce) to the catalogue with source timestamps; 80 generic entries remain. The in-progress `src/lib/pricing/cesta-mcp.ts` client and UI refresh action are unfinished. Open Prices had only one observation among 191 prices for 41 matching Portuguese Continente/Pingo Doce locations in the prior 30 days; it was dated 2026-11-06 and is not current. Open Food Facts matched the Continente rice EAN but is product metadata, not a price source. Cesta exposes no postcode/store selector, so local-branch availability cannot be asserted. No paid APIs, background polling, or direct retailer scraping were added. Observed-price freshness, promotion handling, safety tests, live-source repeatable checks, UI integration, production build, and final documentation remain unfinished. At pause: typecheck, lint (two existing warnings), all 88 unit tests, and `validate:data` pass. End-to-end tests and production build were not run after the latest pricing edits. Do not mark Phase 6 complete or start the optimiser until this work is resumed and all relevant checks pass.

Recovery audit 2026-11-17: Scrapling and Cesta source files, UI, tests and route are present, but both conflict with the fixed no-scraping/no-live-price scope. The Scrapling worker returns hard-coded observations when fetching fails, so it is not safe to call a live integration. See `RECOVERY_REPORT.md`; implementation is paused pending a human decision about resolving this specification conflict. Current checks: typecheck passed, lint passed with 9 warnings, data validation passed; unit, build and Playwright commands did not return final statuses during the audit.

Recovery completion 2026-11-17: external Scrapling and Cesta calls are disabled. The Scrapling worker is retained as a quarantined non-network entry point and no longer contains fallback prices. The API route returns `EXTERNAL_PRICING_DISABLED`, the live-refresh controls were removed, and local manual entry/import/export/history remain active. Optimiser and swaps remain parked.

## Phase 7 — Multi-source product data foundation

Status: done — local observation foundation only; no external fetching enabled

- Added source-neutral raw observations with provenance, raw payloads, timestamps, missing fields, review status and retrieval errors.
- Added pure Open Food Facts and Open Prices payload normalizers; they accept user-supplied JSON and do not perform HTTP requests.
- Added exact-EAN and name-candidate matching suggestions, stale observation classification and adversarial unit tests.
- Added local JSON observation import, review display and rejection in the catalogue manager. Imported observations remain separate from approved Products; no automatic approval or price-state conversion occurs.

## Phase 17 — Product review, validation and controlled approval

Status: investigated and preserved; no automatic approvals

- Audited the Phase 16 batch and preserved all 14 pending observations.
- Confirmed that review must continue through the existing explicit approval, audit, backup and safety validation workflow.
- No product records were added or approved automatically.
- Existing manual entry, CSV/JSON product import/export, price history, safety checks and budget calculations remain unchanged. Pingo Doce is not claimed to work.

## Phase 10 — Real catalogue enrichment

Status: done — evidence report and offline preservation only

- Audited existing real/non-generic records and saved Scrapling observations.
- Added a reproducible catalogue quality report and script.
- Did not promote the three Continente Scrapling observations into Products because fixed package semantics and safety evidence are missing; no fabricated catalogue records were added.
- Pingo Doce remains unexpanded because reliable current product evidence is unavailable.

## Phase 8 — Controlled observation approval and catalogue integration

Status: done

- Added explicit approval for existing-product enrichment and new-product creation with identity, package and safety confirmations.
- Exact EAN and name candidates remain suggestions only; package conflicts and retailer mismatches are rejected, and existing catalogue validators run before persistence.
- Observed prices remain `observado`; Open Food Facts cannot supply a price, and missing safety data remains unknown.
- Added local before/after audit records, observation status updates, duplicate prevention and explicit rejection/pending states.
- Added approval controls to the local catalogue observation panel. No external fetching, optimiser or recipe swaps were added.

## Phase 9 — Offline real-observation import

Status: done — offline import only

- Kept the approved no-live-fetch specification unchanged.
- Added a pure adapter for previously saved Scrapling collector JSON, preserving source URL, retailer, product ID, timestamp, raw evidence, price/unit-price fields and missing safety fields.
- The catalogue observation importer accepts normalized observations and standalone collector arrays, then sends them through the Phase 8 review/approval workflow.
- No collection, Open Food Facts lookup, Open Prices lookup or Pingo Doce fetching occurs in SmartBasket.

## Phase 11 — Variable-weight product model

Status: done

- Added fixed-package, variable-weight and per-unit selling models while preserving fixed-package defaults for existing products.
- Added minimum purchase quantity, quantity-per-unit and actual checkout quantity fields.
- Updated selection, basket, budget-facing expected checkout data, shopping-list text, validation and CSV/JSON persistence.
- Variable-weight products without actual checkout quantity remain incomplete and never claim an exact checkout total.
- Added calculation and import/export regression coverage. No observations were promoted and no external data was fetched.

## Phase 12 — Offline catalogue quality recovery

Status: done — validator quality improvements only; product enrichment blocked by evidence

- Audited saved collector files and existing non-generic product records without network access.
- Added retailer-scoped uniqueness checks for barcodes and external product IDs; repeated primary/alias barcode representation within one product remains valid.
- No products were added. Saved Continente observations lack confirmed package size and allergen data (and include retrieval failures); saved Pingo Doce evidence does not support further real products. The two existing observed rice records retain unknown allergens and dietary compatibility and remain unapproved for safe use.
- No live prices, external requests, paid services, or fabricated data were used.
- Verification: typecheck passed; lint passed with 10 existing warnings and 0 errors; 13 test files / 107 tests passed; production build passed; `validate:data` passed.

## Phase 13 — Settings, data management and audit history

Status: done

- Added `/definicoes`, `/historico`, and `/sobre-precos` with responsive pt-PT navigation and explanations of all price certainty states, stale observations, variable-weight uncertainty, and incomplete budgets.
- Added complete schema-versioned JSON backup/restore for local catalogue, plan, saved wizard preferences, observations, approval records, product audit events and plan-generation state. Restore validates all sections, previews counts and conflicting product IDs, requires explicit confirmation, and replaces one canonical storage envelope atomically. Unsupported or incomplete backups are rejected.
- Added confirmed local data reset by atomically writing an empty envelope; the shipped catalogue remains available.
- Added future product create/update and observation rejection audit events. The history presents existing price history and observation approval records, paired original/result values when available, translated price states, source, timestamp and associated IDs. Missing past events are marked unavailable rather than fabricated.
- Added regression checks for legacy-key migration, reset/restore failure preservation, unsafe plan overrides and confirmation behavior.
- Verification: typecheck passed; lint passed with 10 existing warnings and 0 errors; 15 test files / 123 tests passed; production build passed; `validate:data` passed.

## Phase 14 — Optional Cesta read-only price discovery

Status: done

- Confirmed live MCP schemas and implemented an explicit allowlist for `search_products`, `get_product`, `compare_price`, `build_basket` and `whats_on_promo`.
- Excluded `create_basket`, `add_items_to_basket` and `create_checkout_link`.
- Added a manually initiated catalogue search; results become pending `RawObservation` records and never bypass approval.
- Preserved retailer identity, source IDs, URLs, timestamps, raw evidence, observed price state, unknown safety fields and stale-price handling.
- Confirmed live read-only observations for both Continente and Pingo Doce. No products were automatically inserted into the active catalogue.

## Phase 15 — Real catalogue coverage audit and implementation plan

Status: investigated and planned; implementation not started

- Audited 40 ingredients, 38 recipe-referenced ingredients, 32 recipes and 82 product records.
- Confirmed 80 generic placeholders and 2 non-generic observed rice records; pending/rejected observation counts are browser-local and not present in repository data.
- Created `PHASE15_PLAN.md` with the complete ingredient matrix, Cesta limitations, enrichment workflow, milestones, risks and implementation sequence.
- No application code, catalogue data, tests, dependencies or configuration were changed.

## Phase 16 — Real product enrichment, batch 1

Status: done — pending observations only

- Searched seven priority ingredient groups at both retailers through the approved read-only Cesta tools.
- Preserved 14 pending observations in `data/phase16-cesta-observations.json`, including timestamps, retailer IDs, URLs, prices, package information and raw detail evidence.
- Added no approved products because all candidates still require ingredient, package, allergen and dietary review.
- Preserved variable-weight candidates as non-fixed evidence and did not infer safety fields.

## Phase 14 — Smart catalogue expansion

Status: done

- Added category and quality filters to catalogue review.
- Added recipe-ingredient coverage reporting.
- Preserved manual Cesta discovery as pending observations only; no automatic product imports or cart actions.
- Current approved real catalogue remains two observed rice records; generic placeholders were not replaced without sufficient evidence.

## Phase 14 — Optional Cesta read-only price discovery

Status: done

- Confirmed live MCP schemas and implemented an explicit allowlist for five read-only tools.
- Excluded cart, checkout and mutation tools.
- Added manually initiated catalogue search; results become pending `RawObservation` records and never bypass approval.
- Preserved retailer identity, source IDs, URLs, timestamps, raw evidence, observed price state, unknown safety fields and stale-price handling.
- Confirmed live read-only observations for both Continente and Pingo Doce. No products were automatically inserted into the active catalogue.
