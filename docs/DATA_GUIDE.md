# Catalogue data guide

The catalogue is stored in `src/data/ingredients.json`, `src/data/recipes.json`, and `src/data/products.json`. Product names are generic catalogue descriptions, not confirmed supermarket listings. Verify a real product's pack size, ingredient/allergen declaration, and dietary suitability against its label before relying on it.

## Add an ingredient

Give it a unique, stable `id`, a pt-PT `name`, category, base unit, a complete EU-14 allergen list (or `unknown` when information is not known), all four dietary compatibility values, and `isNeutral`. Neutral only exempts an ingredient from the ingredient-level diet check. It never exempts ingredient or product allergens, and never bypasses product-level dietary compatibility. Add `unitConversions` for any loose recipe unit used with that ingredient; values convert one loose unit into the ingredient base unit.

## Add a recipe

Use at least one known meal type, one ingredient line, and one preparation step. Keep amounts positive and use each ingredient's base unit unless a valid `unitConversions` entry supports the loose unit. Derive `declaredAllergens` from the union of ingredient allergen lists; any unknown ingredient allergen makes the result `unknown`. Derive all four `declaredDietCompatibility` values from ingredient values, ignoring neutral ingredients for diet derivation. Do not guess either declaration.

Every ingredient used by a shipped recipe must have at least one generic product for both Continente and Pingo Doce. Ingredient and product allergen checks both apply. An unknown allergen record is unsafe for a user who declared any allergy.

## Add a product and enter a price

Add one product record per supermarket with a unique ID, matching `ingredientId` and base unit, a plausible pack size, allergen data at least as complete as the ingredient's known allergens, and all four diet values. Use `unknown` allergen data for processed or branded-style products when the composition cannot be established from the generic definition.

New seed products must have `price: null`, `priceState: "desconhecido"`, and `priceUpdatedAt: null`. Never invent or copy a price into the seed catalogue. When a human supplies a price, record the observed amount in euros with at most two decimal places, set `priceState` to `manual`, and set `priceUpdatedAt` to the observation date in `YYYY-MM-DD` form. A `verificado` price follows the same fields after the human has verified it. Estimates are separate: keep `price: null`, set `priceState: "estimativa"`, and provide `estimate.value` plus `estimate.enteredAt`; optional bounds must be supplied together and satisfy `low <= value <= high`.

Promotions may only accompany a manual or verified price, must be lower than that price, and require a `validUntil` ISO date. No price is fetched from a supermarket; the app has no live pricing.

## Validate

Run `npm run validate:data` after editing any catalogue file. It checks data shapes, closed enums, unique IDs, references, derived allergen and diet declarations, product constraints, price invariants, and product coverage for recipe ingredients. The command exits non-zero and prints paths for invalid records.

Before launch, check every allergen and diet declaration against the actual product packaging. Generic catalogue data does not establish absence of cross-contamination and must never be presented as an allergen-free guarantee.

## Update products in the application

Open **Gerir produtos e preços** from the planner, or visit `/catalogo`. Product changes are saved in this browser's local storage and become the catalogue used by product selection and basket calculations on that device. Nothing is uploaded to a server. The shipped generic catalogue is retained; imports add or update products by stable `id`.

Use the product editor to add a supermarket-specific product or edit its name, brand, pack size, ingredient match, URL, barcode, price state, and safety declarations. Keep price as **Desconhecido** unless you have a value. **Manual** means a user-entered amount; **Verificado** requires a separate confirmation that you checked it against the linked or otherwise consulted source, and a date. **Estimativa** remains distinct from an observed price and can optionally include a complete low/high range. Unknown allergen and dietary data must remain unknown. The shared safety checks continue to reject unknown compatibility when the selected profile requires it.

CSV and JSON export contain the complete product records, including IDs, safety fields and history. Imports validate against the shipped catalogue, merge by ID, and preserve existing history when an incoming row does not include history. To update existing products, retain their IDs. The CSV header row is included in exports; structured fields such as `allergens`, `dietCompatibility`, `estimate`, `promo` and `priceHistory` are JSON cells. Importing a `verificado` price requires checking the confirmation box. Always inspect imported data before using it; the confirmation is an explicit user attestation, not an automatic source check.

## External public data leads

Open Prices (Open Food Facts) is a no-cost, crowdsourced source of price observations, with downloadable/API data and ODbL attribution/share-alike terms. Coverage and freshness vary by product, store and date; records are not treated here as verified current prices. It may be used as a research or manually reviewed import lead only after the user checks the actual product and applicable license obligations. Open Food Facts product records are also volunteer-contributed and their documentation cautions that data may be incomplete or inaccurate. This application does not fetch these services, scrape retailer sites, or require an account/API key. Continente's terms say prices may vary by store and date, which is another reason a source link and observation date matter. Public source references:

- [Open Prices data and license guide](https://openfoodfacts.github.io/open-prices/guides/data/)
- [Open Food Facts API documentation and data caveats](https://openfoodfacts.github.io/openfoodfacts-server/api/)
- [Continente terms and conditions](https://siga.continente.pt/termos-e-condicoes/)
