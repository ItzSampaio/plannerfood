# SmartBasket manual price collector

This is a standalone investigation tool. It is not connected to SmartBasket.

It uses Scrapling's documented `Fetcher.get()` HTTP API for one or more public
Continente or Pingo Doce product URLs. It makes one ordinary request per URL,
does not use browser stealth, proxies, retries, CAPTCHA handling or fallback
prices, and records a UTC observation timestamp. Missing fields remain `null`.

Install the official package in the selected Python environment:

```powershell
pip install "scrapling[fetchers]"
```

Run:

```powershell
python tools/price-collector/collector.py <continente-url> <pingo-doce-url> --output observations.json
```

The output is raw evidence for human review only. It is not a SmartBasket
catalogue import and does not establish allergen or dietary safety.

## Investigation notes — 2026-11-17

Continente public product pages returned HTTP 200 for three current URLs. The
pages exposed JSON-LD with product name, brand, SKU, displayed EUR price,
availability and source URL. Their embedded analytics also exposed a unit and
unit-price value. Package size and fixed-package semantics were not assumed:
the collector keeps `packageSize` null and marks a page as `weightedProduct`
only when the page visibly contains a minimum-quantity notice.

The public Pingo Doce homepage and category pages returned HTTP 200, but their
ordinary HTML did not expose individual product URLs. The previously known
Pingo Doce product URL returned HTTP 404. No restricted search endpoint,
internal endpoint, proxy or fallback observation was used, so no Pingo Doce
product observation was created.

Continente's robots.txt disallows internal/dynamic search paths; this tool only
uses manually discovered public product URLs. Pingo Doce's robots.txt returned
HTTP 403 and was not bypassed.
