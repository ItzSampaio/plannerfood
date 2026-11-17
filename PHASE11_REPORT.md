# SmartBasket Phase 11 report

Implemented a backward-compatible product selling model.

- `fixed_package`: legacy/default behaviour; quantity rounds to whole packages and checkout cost is package count × package price.
- `variable_weight`: quantity respects an explicit minimum and uses an explicit unit-price basis. Expected cost is calculated, but exact checkout cost remains unknown unless an actual checkout quantity is recorded.
- `per_unit`: quantity rounds to whole units. Products whose ingredient base unit is mass/volume require an explicit quantity per purchased unit.

Existing products continue to default to `fixed_package`. No observations were promoted and no external data was fetched.

For backward compatibility, the existing required `packSize` field remains in the product schema. Variable-weight and per-unit calculations do not use it as a fixed checkout package; they use the explicit selling model, unit price, minimum quantity and quantity-per-unit fields. Existing editor/schema compatibility is therefore preserved while variable records require the new fields needed for meaningful calculations.

The basket carries expected checkout cost separately from exact checkout cost. Variable-weight products without actual checkout quantity remain incomplete. Consumption cost remains separate. The shopping list explains package, unit or variable-weight purchase behaviour.

CSV/JSON import/export preserves selling model, minimum quantity, quantity-per-unit and actual checkout quantity fields. Validators reject invalid model/unit/minimum configurations.

Verification: typecheck passed; lint passed with 10 warnings and 0 errors; unit tests passed — 13 files, 104 tests; production build passed; data validation passed. No paid service, external fetch or scraping was used.
