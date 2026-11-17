# Cesta MCP integration report

Date: 2026-11-17

## Schema inspection

Live MCP `initialize` succeeded against `https://cesta.pt/mcp` and reported server version `0.3.0`. `tools/list` exposed these read-only tools:

- `search_products`: `{ query: string, stores?: ["continente"|"pingodoce"], limit?: 1..20 }`
- `get_product`: `{ store: "continente"|"pingodoce", pid: string }`
- `compare_price`: `{ product: string }`
- `build_basket`: `{ items: string[1..30], strategy?: "single_store"|"cheapest"|"best_promos" }`
- `whats_on_promo`: `{ query: string, store?: "continente"|"pingodoce", limit?: 1..20 }`

`create_basket`, `add_items_to_basket` and `create_checkout_link` were exposed by the server but are excluded from SmartBasket. The client has an explicit allowlist and never calls them.

## Live discovery check

Manual read-only calls returned observations for both retailers:

- Continente: Arroz Agulha Continente, pid `6927230`, €1.15, URL, EAN `5601312076315`, minimum quantity 1 and step 1.
- Pingo Doce: Arroz Agulha Europa, pid `651178`, €1.15, URL, package `1 Kg`, availability available.
- Search also returned Continente pid `2305902` and Pingo Doce pid `623900`, including a Pingo Doce promotion.

These remain observations, not verified checkout prices, and were not auto-imported into Products.

## Implementation

The catalogue manager now provides a manually initiated cesta.pt search. Results become pending `RawObservation` records and pass through the existing Phase 8 approval workflow. Only the minimum query/retailer data is sent; no profile, household, history, credentials, cart or checkout data is sent.

The adapter preserves source `cesta_mcp`, retailer, product ID, URL, observed price, unit price, package text, raw response and retrieval timestamp. Missing EAN, ingredients, allergens and dietary data remain unknown. Prices remain `observado`; weighted prices remain uncertain without actual checkout quantity.

## Terms and limitations

Cesta describes itself as free, unauthenticated and independent. Its terms warn that automatically read prices can be wrong or stale, weighted prices are estimates, totals exclude delivery, and cart links are public. SmartBasket uses only read-only discovery/comparison functionality.

## Verification

- Typecheck: passed.
- Unit tests: passed — 15 files, 124 tests.
- No paid service, account, cart mutation or checkout operation was used.
