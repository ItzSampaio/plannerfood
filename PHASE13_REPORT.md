# SmartBasket Phase 13 report

## Features implemented

- Added `/definicoes` for local data information, saved preference explanation, catalogue access, JSON backup/restore, and confirmed reset.
- Added `/historico` for product changes, price history, observation approvals and rejections. It displays original/resulting values where recorded, source, timestamp and product/observation IDs. Missing legacy history is shown as unavailable; no events were generated retroactively.
- Added `/sobre-precos` for Manual, Verificado, Estimativa, Observado and Desconhecido prices, stale observations, variable-weight uncertainty and incomplete budget explanations.
- Added responsive shared navigation to the application.

## Files created and modified

Created: `PHASE13_REPORT.md`; `src/app/definicoes/page.tsx`; `src/app/historico/page.tsx`; `src/app/sobre-precos/page.tsx`; `src/components/settings/settings-page.tsx`; `src/components/settings/audit-history.tsx`; `src/lib/data/application-backup.ts`; `src/lib/data/audit.ts`; `src/lib/state/application-storage.ts`; `tests/data/application-backup.test.ts`; `tests/settings/settings-page.test.tsx`.

Modified: `src/app/layout.tsx`; `src/app/globals.css`; `src/app/plan/refeicao/[id]/page.tsx`; `src/components/catalogue/product-catalogue-manager.tsx`; `src/components/planner/planner-dashboard.tsx`; `src/components/wizard/setup-wizard.tsx`; `src/lib/state/plan-storage.ts`; `tests/planner/phase5.test.tsx`; `tests/wizard/wizard-ui.test.tsx`; `e2e/catalogue.spec.ts`; `e2e/plan-flow.spec.ts`; `docs/DECISIONS.md`; `docs/IMPLEMENTATION_PLAN.md`.

## Backup format and migration

The downloaded JSON is `{ app: "smartbasket", schemaVersion: 1, exportedAt, data }`. `data` contains every supported local record section: catalogue products (including price history), plan, saved wizard preferences, observations, approval audit records, product audit events and plan generation seed. Missing sections are explicit `null`; imports missing a section, containing unknown sections, or using a different schema version are rejected.

Legacy per-feature localStorage keys remain readable. On the first successful app data write, they are consolidated into `smartbasket:application:v1`, whose version 1 envelope stores the existing section keys and their JSON strings. The canonical envelope is written before legacy keys are removed. If storage has insufficient room for this initial migration, that write fails without removing the legacy data.

## Restore validation and failure behavior

The selected file is fully parsed and validated before any storage write. Validation checks the catalogue and all product records, observation field shape and duplicate IDs, audit record shape and duplicate audit IDs, wizard draft shape, plan generation state, and saved plan recipe/profile/product override safety using the existing catalogue and shared safety functions. The preview reports section counts and product IDs whose records differ from current local records. Restore requires a second explicit confirmation.

Restore replaces one canonical localStorage value. A validation failure does not write anything; if the browser rejects the single-key write (for example, due to quota), the old canonical value remains. After a successful write, old legacy keys are cleaned up; those cleanup attempts do not affect the canonical record. Reset uses the same single-envelope approach and also requires explicit confirmation.

The backup schema is versioned but has no automatic cross-version migration. Incompatible versions are rejected, leaving current data intact. A restored backup intentionally replaces current data after the user reviews the preview and confirms; the UI calls out conflicting stable product IDs.

## Audit coverage

Product creation and edits, observation approval and rejection are recorded going forward. Product changes, audit events and observation status are written together in one envelope update. Existing per-product price history and observation approval records are included in backup and shown in the audit page. Earlier product changes or rejections that were never recorded cannot be reconstructed and are identified as unavailable.

## Tests and verification

- Backup coverage includes export/restore round-trip, schema mismatch, missing/unknown sections, corrupt JSON, duplicate product and observation IDs, conflicting product records, valid and unsafe saved plans, failed atomic restore, legacy-key migration, and reset confirmation/failure preservation.
- Audit coverage checks product before/after values, price history pairing, and observation rejection IDs/source/state.
- Unit tests: **15 files, 123 tests passed**.
- `npm.cmd run typecheck` — passed.
- `npm.cmd run lint` — passed, 0 errors and 10 existing warnings.
- `npm.cmd run build` — passed; `/definicoes`, `/historico` and `/sobre-precos` are generated.
- `npm.cmd run validate:data` — passed.

## Remaining limitations

- Product and rejection audit events begin with this phase. Historical activity absent from existing price history or approval records is unavailable.
- Preferences are the existing wizard answers and saved plan profile; this phase adds no unsupported global toggles.
- Backups are local files controlled by the user. Schema versions other than 1 require a future deliberate migration; none is guessed.
- End-to-end Playwright tests were updated for the new envelope but were not part of the requested verification commands and were not run.
