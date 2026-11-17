# SmartBasket catalogue coverage

Generated from the recipe ingredient references and shipped product data by
`scripts/catalogue-coverage.ts`.

Current state:

- Recipe ingredients referenced: 40.
- Real approved products: 2, both prior observed rice records.
- Generic placeholders: 80.
- Pending/rejected observations are not counted as catalogue products.
- The Cesta provider can discover additional products manually, but discovery
  does not approve or insert them automatically.

The remaining gap is evidence quality, not a missing product-selection path.
Real products need reviewed retailer identity, package semantics, ingredient
mapping and safety data before they can safely replace generic records.
