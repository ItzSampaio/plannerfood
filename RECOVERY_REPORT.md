# SmartBasket recovery report

Date: 2026-11-17
Project directory: `C:\Users\Utilizador\Downloads\py`

## Result

The previous SmartBasket implementation survived in the repository. Phases 1–5, local catalogue management, manual price entry, CSV/JSON import/export, price history, safety checks, basket calculations, budget logic, wizard and planner remain available. The optimiser and recipe swaps were not changed.

The incomplete external pricing work was quarantined rather than deleted:

- `scraper/worker.py` remains as a disabled entry point and never performs a request or emits a price.
- `/api/scrapling/refresh` remains as a compatibility route but returns HTTP 410 with `EXTERNAL_PRICING_DISABLED`.
- Hard-coded Scrapling fallback observations were removed.
- The Scrapling refresh button and Cesta live-search controls were removed from the running catalogue UI.
- The Cesta adapter remains for reference, but its network boundary fails before any request.
- Local manual/imported catalogue workflows and price history remain active.
- Unknown allergens and dietary compatibility remain fail-closed, and unknown/stale prices remain excluded from confirmed basket totals.

The old Scrapling unit/UI and Playwright tests depended on fabricated external observations and were replaced with deterministic disabled-boundary coverage. No tests make external network requests.

## Verification

- `npm.cmd run typecheck`: passed.
- `npm.cmd run lint`: passed with 10 warnings and 0 errors. Warnings are unused quarantined Cesta helpers/constants and two pre-existing unused React eslint directives.
- `npm.cmd test`: passed — 12 files, 90 tests.
- `npm.cmd run build`: passed — Next.js production build completed successfully.
- `npm.cmd run validate:data`: passed.
- `npm.cmd run test:e2e`: passed — 3 tests.

All changes are saved to disk. The working tree contains the intended recovery documentation, disabled integration changes, deterministic tests, and the pre-existing `next-env.d.ts` modification; no destructive Git operation was used.
