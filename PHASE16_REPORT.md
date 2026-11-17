# SmartBasket Phase 16 report

## Result

The authorised Cesta discovery was performed manually for the seven priority
ingredient groups across Continente and Pingo Doce. Fourteen pending Cesta
observations were preserved in `data/phase16-cesta-observations.json`.

No observation was automatically approved or inserted into the active product
catalogue. Existing real products and generic placeholders were preserved.

## Discovery summary

- Search groups: arroz, azeite, cebola, tomate, leite meio gordo, ovos and
  feijão/grão/lentilhas.
- Retailers searched: Continente and Pingo Doce.
- Pending observations created: 14.
- Continente observations: 7.
- Pingo Doce observations: 7.
- Products with EAN in this batch: 4.
- Products with explicit package information: 14, although weighted records
  remain variable-weight candidates.
- Products with known allergens: 0.
- Products with known dietary compatibility: 0.
- Observed prices: 14.
- Approved products added: 0.

The batch includes fixed-package candidates such as rice, olive oil, milk,
eggs and cooked beans, plus weighted fresh products such as onions, tomatoes
and green beans. All safety fields remain unknown pending product-label review.

## Limitations

- Cesta detail responses do not consistently provide ingredients, allergens,
  nutrition or dietary compatibility.
- Some package information is only a minimum quantity or a variable-weight
  selling rule and must not be treated as a fixed package.
- Prices are observations and may be stale or differ at checkout.
- Grão-de-bico and lentilhas did not produce suitable first-page candidates in
  the combined search used; they remain pending investigation.
- The active catalogue remains mostly generic until a reviewer confirms each
  candidate's ingredient mapping, package/selling model and safety evidence.

## Verification

- Typecheck: passed.
- Unit tests: passed — 15 files, 124 tests.
- Lint: passed with 2 existing warnings and 0 errors.
- Build: passed.
- Data validation: passed.

No paid services, cart mutation, checkout, account access, proxy, scraping
bypass or automatic approval was used.
