# SmartBasket Phase 15 plan — Real catalogue coverage audit

## Executive summary

The repository has a strong safety, calculation and local-review foundation,
but the active catalogue is not yet a real supermarket catalogue.

Current data contains 82 product records:

- 80 generic placeholders.
- 2 non-generic observed rice records: one Continente and one Pingo Doce.
- 1 EAN-bearing product.
- 80 unknown-price products.
- 2 observed-price products, both stale relative to 2026-11-17.

No repository file records pending or rejected observations. Those states are
stored in browser localStorage and therefore cannot be counted from the
checkout without opening that user's browser data. The application correctly
keeps pending observations out of the active catalogue.

Phase 15 should focus on a small number of fully reviewed products for the
highest-value ingredients, not on reaching an arbitrary product count.

## Verified current catalogue statistics

Generated from `src/data/ingredients.json`, `src/data/recipes.json` and
`src/data/products.json`.

| Metric | Current value |
|---|---:|
| Total ingredients | 40 |
| Ingredients referenced by recipes | 38 |
| Total recipes | 32 |
| Total product records | 82 |
| Generic placeholders | 80 |
| Non-generic records | 2 |
| Continente records | 41 |
| Pingo Doce records | 41 |
| EAN-bearing products | 1 |
| Products with package fields | 82, but generic evidence is not proof of real packaging |
| Known allergen lists | 76 |
| Unknown allergens | 6 |
| Complete dietary compatibility | 76 |
| Unknown dietary compatibility | 6 |
| Manual prices | 0 |
| Observed prices | 2 |
| Verified prices | 0 |
| Unknown prices | 80 |
| Pending observations in repository | 0 persisted records; runtime localStorage only |
| Rejected observations in repository | 0 persisted records; runtime localStorage only |

The two non-generic records are the existing observed rice products. They are
not current guaranteed prices, and their unknown safety fields mean they must
not pass active allergen/diet filters that require certainty.

## Complete recipe-ingredient coverage matrix

`Real` means a non-generic product record exists in the shipped JSON. `Generic`
means only the generic seed product exists. `Safe selection` is not claimed for
the real rice records when an active diet/allergen rule needs unknown safety
information.

| Ingredient | Recipe uses | Continente real | Pingo Doce real | Current status | Main gap |
|---|---:|---:|---:|---|---|
| Abóbora | 4 | 0 | 0 | Generic only | Real identity, package and safety |
| Água | 22 | 0 | 0 | Generic only | Not a priority product; neutral ingredient |
| Alho | 6 | 0 | 0 | Generic only | Fresh-product evidence |
| Arroz | 6 | 1 | 1 | Real observed + generic | Stale price; unknown safety/diet |
| Azeite | 21 | 0 | 0 | Generic only | Brand, bottle size, EAN, label |
| Banana | 4 | 0 | 0 | Generic only | Existing raw observations lack fixed package/safety |
| Batata | 4 | 0 | 0 | Generic only | Variable-weight semantics |
| Batata-doce | 3 | 0 | 0 | Generic only | Variable-weight semantics |
| Canela | 8 | 0 | 0 | Generic only | Brand, size and label |
| Cebola | 15 | 0 | 0 | Generic only | Variable-weight semantics |
| Cenoura | 4 | 0 | 0 | Generic only | Variable-weight semantics |
| Coentros | 2 | 0 | 0 | Generic only | Fresh package/weight |
| Cogumelos | 2 | 0 | 0 | Generic only | Package and safety |
| Curgete | 1 | 0 | 0 | Generic only | Variable-weight semantics |
| Couve | 2 | 0 | 0 | Generic only | Fresh package/weight |
| Ervilhas | 3 | 0 | 0 | Generic only | Frozen/canned identity |
| Espinafres | 5 | 0 | 0 | Generic only | Fresh/frozen package |
| Feijão-preto seco | 2 | 0 | 0 | Generic only | Package and label |
| Frango | 1 | 0 | 0 | Generic only | Variable-weight/meat label |
| Grão-de-bico seco | 4 | 0 | 0 | Generic only | Package and label |
| Laranja | 5 | 0 | 0 | Generic only | Variable-weight semantics |
| Lentilhas secas | 2 | 0 | 0 | Generic only | Package and label |
| Limão | 5 | 0 | 0 | Generic only | Variable-weight semantics |
| Maçã | 5 | 0 | 0 | Generic only | Variable-weight semantics |
| Farinha de milho | 1 | 0 | 0 | Generic only | Package and label |
| Ovo | 1 | 0 | 0 | Generic only | EAN, carton size and allergen confirmation |
| Pão de trigo | 1 | 0 | 0 | Generic only | Ingredients/allergens are essential |
| Pepino | 1 | 0 | 0 | Generic only | Variable-weight semantics |
| Pera | 4 | 0 | 0 | Generic only | Variable-weight semantics |
| Pimenta-preta | 1 | 0 | 0 | Generic only | Package and label |
| Pimento | 1 | 0 | 0 | Generic only | Variable-weight semantics |
| Queijo | 1 | 0 | 0 | Generic only | Label, milk allergen and diet evidence |
| Quinoa | 4 | 0 | 0 | Generic only | EAN, package and label |
| Sal | 21 | 0 | 0 | Generic only | Low priority; neutral ingredient |
| Salsa | 5 | 0 | 0 | Generic only | Fresh package/weight |
| Sardinha | 1 | 0 | 0 | Generic only | Fish label, EAN and allergens |
| Tomate | 10 | 0 | 0 | Generic only | Fresh/canned distinction |
| Vinagre simples | 1 | 0 | 0 | Generic only | Bottle size and label |

The matrix shows the central problem: every recipe ingredient has a generic
record for both retailers, but only rice has a real observed record for each.

## Cesta discovery capabilities and limitations

The existing client has a manually initiated `search_products` path and an
allowlist containing:

- `search_products`
- `get_product`
- `compare_price`
- `build_basket`
- `whats_on_promo`

Cart and checkout tools are excluded.

Live inspection demonstrated that search can return both retailers, product IDs,
URLs, prices, unit prices and promotion text. `get_product` can return a
Continente EAN and, for Pingo Doce, package/availability information.

Still missing or inconsistent:

- ingredients and allergens are not reliably returned;
- dietary compatibility is not returned as a validated SmartBasket field;
- EAN availability differs by retailer;
- package/minimum quantity semantics vary;
- weighted products are estimates until actual checkout weight is known;
- response structure is text-heavy and may change;
- prices are observations, not guaranteed checkout prices;
- promotion validity must be preserved as source evidence, not treated as a permanent catalogue fact;
- localStorage observations are not visible from repository inspection.

## Recommended enrichment workflow

1. Generate a priority queue from recipe frequency, starting with rice, olive oil,
   onions, tomatoes, milk, eggs, legumes and common vegetables.
2. Search one ingredient at a time with an explicit retailer selection.
3. Retrieve details only for shortlisted product IDs.
4. Normalize every response into a pending `RawObservation` with source,
   retailer, product ID, URL, timestamp, price and raw text.
5. Deduplicate by retailer + product ID, then EAN where present.
6. Show package, selling model, missing safety fields and duplicate candidates.
7. Require manual ingredient mapping and safety/package confirmations.
8. Approve only records that pass existing validators.
9. Preserve every approval/rejection in the existing audit trail.
10. Re-run catalogue coverage and recipe availability after each review batch.

Batch discovery is useful, but approval must remain batch-reviewable rather than
automatic. A reviewer should be able to defer an uncertain record without
blocking unrelated products.

## Proposed UI improvements

- Add a “fila de prioridade” view ordered by recipe usage count.
- Add observation filters: retailer, pending/approved/rejected, missing EAN,
  missing package, unknown allergens, unknown diet, stale price and duplicate.
- Show Cesta result fields side by side with the proposed Product fields.
- Show “why not selectable?” reasons for retailer mismatch, unknown safety,
  stale price, unavailable state and invalid selling model.
- Add multi-select review actions for rejection/defer only; approval should
  still require per-record confirmation.
- Show real/generic status and source provenance in the shopping list product
  detail.

## Data-model changes

No immediate new model is required for the first enrichment batch. The existing
RawObservation and approval model are sufficient. Before large-scale review,
consider adding explicit observation fields for:

- Cesta promotion end date;
- retailer availability reason;
- source response format/version;
- product category returned by Cesta;
- a review reason/conflict list.

These should be additive and backward-compatible. Do not put source-derived
unknown safety data directly into Ingredient or Product without review.

## Measurable milestones

Success is defined by safe selection, not record count:

1. First batch: rice, olive oil, onions, tomatoes, eggs and legumes, both
   retailers where Cesta returns usable data.
2. Each approved product must have retailer identity, stable product ID, source
   URL, timestamp, ingredient mapping and package/selling-model review.
3. A product with unknown allergens remains unavailable to allergic profiles.
4. A product with unknown diet compatibility remains unavailable for an active
   diet.
5. At least ten high-frequency recipe ingredients should have one safely
   selectable real product for each retailer before expanding to low-frequency
   ingredients.
6. No stale observation should be used as a current price recommendation.
7. Every batch should report approved, pending, rejected and safely selectable
   counts separately.

## Testing strategy

Use local MCP fixtures for search/detail/promotion responses. Test:

- both retailer identities;
- product ID and EAN deduplication;
- package-size differences;
- promotions and timestamps;
- malformed/missing fields;
- stale observations;
- weighted products;
- pending/approval/rejection/defer flows;
- unknown allergen/diet fail-closed behavior;
- backup/restore of observations and audit records;
- existing basket and budget regressions.

No normal test may require live Cesta access.

## Exact implementation sequence

1. Add fixture-based Cesta response coverage and normalize all observed fields.
2. Add priority-queue and coverage computation without changing selection rules.
3. Improve pending-observation filters and side-by-side review.
4. Run small manual discovery batches for the highest-frequency ingredients.
5. Approve only records with complete identity/package/safety review.
6. Recalculate recipe coverage and safely selectable counts.
7. Add only evidence-backed catalogue records; leave all uncertain records pending.
8. Re-run all project verification and publish a new phase report.

## Risks and safeguards

- Cesta response changes: fixture parser tests and clear malformed-response errors.
- Retailer identity mixing: require retailer-scoped IDs and display retailer in review.
- Duplicate products: reject duplicate EAN/product IDs per retailer.
- Unsafe enrichment: preserve unknowns and route through validators.
- Stale prices: freshness checks before recommendations.
- Weighted checkout mismatch: expected cost is never shown as exact checkout.
- Catalogue bloat: prioritize recipe frequency and safely selectable coverage.
