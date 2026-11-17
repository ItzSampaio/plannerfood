# Continente MCP Read-Only Feasibility Review

**Reviewed upstream revision:** [`v0.16.1`](https://github.com/andredelgado/continente-mcp/tree/v0.16.1)  
**Review mode:** source and metadata inspection only. The package was not installed or run; no Continente requests or product retrievals were made.

## Summary

The catalogue path is architecturally separable from cart writes and account/order features. A restricted tool can be composed from the upstream catalogue services and the existing MCP server primitives without invoking `createShoppingApplication()` or `createShoppingServices()`. That would still execute the headless browser and make ordinary storefront requests to Continente when a user explicitly invokes a discovery tool.

This establishes technical feasibility, not permission to automate the retailer site. The upstream project calls itself unofficial, says it automates the public site, and directs users to follow Continente's terms. The reviewed retailer service policy warns against fraudulent activity and warns that product information can change, but the source reviewed here does not answer whether this particular automated catalogue use is permitted. A restricted integration should remain unimplemented until that operational/legal uncertainty is resolved. This review makes no claim that automated collection is permitted.

## Minimum upstream modules

The source layout is layered; “minimum” here means the relevant functional source areas and their transitive dependencies, not a ready-made public submodule in the published package.

| Capability | Relevant source path |
|---|---|
| Search | `src/services/catalog.ts` (`CatalogService.searchProducts`); `src/clients/storefront.ts` (`StorefrontClient`, `CatalogClient.searchProducts`); `src/parsers/catalog.ts`; package parsing and the product/search domain schemas under `src/parsers/` and `src/domain/` |
| Product details | Same catalog service/client; `src/parsers/product.ts`; `src/parsers/package.ts`; `src/parsers/catalog.ts`; product/price/quantity schemas in `src/domain/` |
| Ingredients, allergens and nutrition | `CatalogService.getProductLabel`; `CatalogClient.fetchProductDetails` and `fetchProductLabel`; `src/parsers/label.ts`; product parser/catalog parser to first discover the product's label URL; domain label schemas |
| Browser/network transport | `src/session/browser.ts`, `src/session/request.ts`, `src/session/queue.ts`, `src/session/checkout-boundary.ts`, `src/session/chromium.ts`, and `src/clients/policy.ts` plus `src/ports.ts` |
| Optional MCP interface | `src/application.ts` and `src/mcp/server.ts`; selected handler schemas and implementations currently live in the broad `src/mcp/shopping.ts` module |

Search and product detail requests do not require a Continente account in the upstream documentation. Labels are linked from the product page and are fetched only after that page yields a product-matched label URL. The label parser distinguishes missing fields from values; it does not turn an absent allergen statement into a “free from” assertion. SmartBasket must preserve missing/unknown allergen and diet information as unknown.

## Separation from other shopping features

At the internal service boundary, the catalogue gateway is independent: it provides product search, detail HTML, and product-label HTML. Those operations do not inherently need cart, checkout, favorites, authentication, or order history. The browser session does install request guards that block cart-write and checkout/payment routes and external navigations.

The high-level upstream composition is broader. `createShoppingServices()` constructs authentication, favorites, cart, order/history, and coupon clients/services even if only `catalog` is later used. `createShoppingApplication()` then registers the entire shopping tool collection. The standard CLI also checks for updates before constructing this application. Therefore neither high-level helper nor the standard CLI is an acceptable restricted entrypoint as-is.

The catalogue service accepts a `FavoritesService` dependency because search can mark/promote saved favorites. A restricted adapter can instantiate that dependency with a local empty/no-network implementation and always pass `favoritesFirst: false`; no favorites client or account state is needed. Alternatively, a small upstream refactor could make favorites optional for search.

The current `registerShoppingTools()` builds the read-only tools together with account/cart tools and is not exported from the package root. It is possible to create a custom `ContinenteMcpServer` containing exactly three independently defined handlers (`search_products`, `get_product`, `get_product_labels`) that call only the catalogue service. The response schemas/argument schemas can be reused from upstream contracts in a source fork, but deep imports are blocked by the package `exports` map. Thus using only the published package cleanly requires an upstream public catalogue-only factory/export, or maintaining a local fork/vendor copy of the selected MIT-licensed modules. A generic wrapper around the full stock CLI is weaker: the underlying server still exposes the prohibited tools on its own transport.

## Network and browser activity

The code paths relevant to search/details/labels make browser navigation or browser-context HTTP requests to `https://www.continente.pt`:

- Search starts at `/pesquisa/` and may follow retailer-provided `Search-UpdateGrid` continuation URLs. Search is bounded to at most five pages per upstream request.
- Product detail navigates to a product URL under `/produto/`.
- Product labels use a same-origin `Product-ProductNutritionalInfoTab` URL discovered from the matching product page; it is fetched through the browser context request client.
- Browser navigation also loads the normal page's scripts, styles, images and other resources. The session boundary filters navigations and blocks explicitly identified cart-write and checkout/payment paths; it does not turn a general web page into a network-free parser.
- The source includes a second page-read attempt when the expected page marker is absent. It is bounded retry logic for page readiness, not a CAPTCHA bypass. Any human-verification request must be treated as a hard stop; the proposed discovery adapter must never launch sign-in or verification flows.
- The default CLI invokes the upstream update checker, which may contact `registry.npmjs.org` once per day and writes an update cache. A custom launcher that does not call the CLI/update service avoids this request. Its configuration must also explicitly disable/avoid credentials and session-cookie loading.

The browser path involves Playwright launching Chromium. If the matching browser binary is absent, `ChromiumInstaller` invokes the Playwright CLI to download Chromium from Playwright's browser distribution. Upstream documentation estimates about 150 MB. This browser download is not a paid service, but it is a sizeable network dependency and must be an explicit first-use/setup action in any future tool. The reviewed implementation does not need a visible login browser for unauthenticated catalogue use. Do not use stealth, proxy rotation, CAPTCHA solving, credential storage, or anti-bot workarounds.

## Dependencies and supply-chain considerations

At `v0.16.1`, package runtime dependencies are pinned to `@modelcontextprotocol/server` 2.4.0, `cheerio` 1.2.0, `playwright` 1.65.0, and `zod` 4.6.7. Package metadata requires Node.js `>=22`. Its package root exports the general application/server types and shopping runtime helpers, but not the catalogue tool registration function; only `.` and `./package.json` are public export paths. This makes direct imports of internal catalogue modules unsupported through normal package resolution.

The full upstream dependency graph is larger in practice than the four direct dependencies, and Playwright adds a separately downloaded browser binary. This is extra runtime surface beyond SmartBasket's current package allowlist. The browser parses retailer-controlled HTML/JavaScript in a local process with the user's permissions, so the browser sandbox, request boundary, input validation, and pinned dependency integrity matter. Upstream code requests Chromium sandboxing and documents when it can fall back without it; a restricted SmartBasket configuration should fail closed if the sandbox is unavailable rather than weaken that boundary.

The previous local metadata check reported no vulnerabilities for SmartBasket's existing production dependency tree; that does not audit or establish the safety of this upstream package's full dependency graph. GitHub showed no published advisories for the upstream repository at review time, which is not equivalent to an independent audit.

## Licensing and reuse

The upstream `LICENSE` is MIT. Reuse or modification of upstream source is allowed if the copyright and MIT license notice are retained with copied/substantial source. That license does not grant permission to automate Continente's site, remove anti-bot controls, or use retailer product content beyond whatever other terms allow. Prefer a pinned dependency or a narrowly scoped fork with an attribution/license file; do not copy code while omitting its notice. Review the licenses of transitive dependencies separately before distribution.

## Windows compatibility

The upstream declares Node.js 22+ and README support for Windows. The reviewed environment is Windows x64 with Node.js 26, so the declared Node engine requirement is met. The package's Playwright Chromium installer is intended to download and run a local browser. This source-only review did not install Chromium or execute the Windows path, so actual installation behavior, Windows Defender handling, sandbox behavior and retailer page rendering remain unverified. Do not claim runtime compatibility has been tested.

## SmartBasket integration constraints

SmartBasket is a browser-only Next.js app with localStorage and an existing JSON observation-import/review flow. A local Node MCP server cannot be called directly by a deployed browser page without introducing a local service/network boundary; it should not be wired into the Next.js page as an unguarded API endpoint. Keep the first integration as an explicitly started local command/MCP tool that emits validated JSON observations to a user-chosen file or stdout. The existing UI can import that file through its normal observation review path.

The adapter must retain source URL, source product ID, EAN when actually returned, package/selling-model text, raw result, retrieval timestamp, and retrieval errors. Translate only fields present and structurally validated; omit unsupported inferences. Set source to a distinct `continente_mcp` value (requiring a deliberate schema/source adapter change), retailer to Continente, and review status to pending. Never create Products directly, infer a fixed package from a label that only describes weighted sale, derive allergens or diet compatibility from missing text, or mark a retrieved price verified. Keep observed price distinct from manual/verified prices and display its timestamp and source.

## Recommended architecture

1. Ask the retailer or obtain reliable terms guidance to resolve whether this specific read-only, low-volume catalogue automation is permitted. The user authorized SmartBasket's scope but that authorization does not resolve the retailer's terms.
2. If resolved, ask upstream for a small supported catalogue-only API: construct only `BrowserSession`, a no-credentials cookie store with an isolated data directory, `StorefrontClient`, `CatalogClient`, and `CatalogService`; disable account recovery and update checks; expose only the three catalogue methods; use the existing checkout/cart-write request guard; and fail closed on human-verification challenges or sandbox failure.
3. Build a thin SmartBasket adapter around those three methods. Do not call `createShoppingServices()`, `createShoppingApplication()`, or the published stock CLI. Use a pinned upstream version and lockfile; review the full dependency audit and retain MIT notices.
4. Emit normalized observations as a file/stdout artifact and import them with the existing explicit review workflow. Test parsers/normalizers against local fixtures, unknown safety data, duplicates, stale timestamps, weighted items, malformed/partial responses, and ensure the restricted MCP tool list cannot call cart/account methods. Actual live use should be separately opt-in and tested only after permitted use is established.

## Remaining uncertainties

- Whether Continente permits automated access of this kind is unresolved from the reviewed public terms. Do not infer permission from the repository's MIT license or the user's project-scope approval.
- The retailer can change page structure, prices, assortment, locale/branch context and availability. The upstream README warns that the automation may break; its displayed availability is not a delivery-slot stock check.
- No product results were requested or fetched in this review. No discovered data can be validated here.
- Runtime installation, Chromium download, Windows sandbox operation, live tool isolation and the full transitive dependency graph were not empirically tested because execution and installation were explicitly prohibited.

## Conclusion

**Feasible without executing the full MCP server.** The source has a separately composable catalogue service path, and a custom allowlisted MCP server can expose only search, product detail and labels. This is a technical conclusion only. It is not approval to implement or run the browser automation; resolving the retailer-terms uncertainty and establishing the restricted launcher/dependency plan remain prerequisites.
