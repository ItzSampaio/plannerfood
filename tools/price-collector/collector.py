"""Small, manual Scrapling collector for public Portuguese product URLs.

This tool is intentionally independent from SmartBasket. It makes no retries,
uses no proxy or browser-stealth mode, and returns an error record rather than
inventing missing product data.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from scrapling.fetchers import Fetcher


RETAILERS = {
    "continente.pt": "continente",
    "pingodoce.pt": "pingo_doce",
}


def retailer_for(url: str) -> str | None:
    host = (urlparse(url).hostname or "").lower().removeprefix("www.")
    for domain, retailer in RETAILERS.items():
        if host == domain or host.endswith("." + domain):
            return retailer
    return None


def first_text(page: Any, selectors: list[str]) -> str | None:
    for selector in selectors:
        value = page.css(selector).get()
        if value:
            value = re.sub(r"\s+", " ", value).strip()
            if value:
                return value
    return None


def parse_json_ld(page: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for raw in page.css('script[type="application/ld+json"]::text').getall():
        try:
            value = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            continue
        values = value if isinstance(value, list) else [value]
        records.extend(item for item in values if isinstance(item, dict))
    return records


def json_ld_product(records: list[dict[str, Any]]) -> dict[str, Any]:
    for record in records:
        if record.get("@type") == "Product" or "offers" in record:
            return record
    return {}


def value_from_offer(product: dict[str, Any], field: str) -> Any:
    offers = product.get("offers")
    if isinstance(offers, dict):
        return offers.get(field)
    if isinstance(offers, list):
        for offer in offers:
            if isinstance(offer, dict) and offer.get(field) is not None:
                return offer[field]
    return None


def extract(url: str) -> dict[str, Any]:
    retailer = retailer_for(url)
    observed_at = datetime.now(timezone.utc).isoformat()
    if retailer is None:
        return {"ok": False, "url": url, "observedAt": observed_at, "error": "Unsupported retailer host"}

    try:
        page = Fetcher.get(url)
    except Exception as error:  # Scrapling/network errors are data, not fallback triggers.
        return {"ok": False, "retailer": retailer, "url": url, "observedAt": observed_at, "error": str(error)}

    if page.status < 200 or page.status >= 300:
        return {"ok": False, "retailer": retailer, "url": url, "observedAt": observed_at, "status": page.status, "error": f"HTTP {page.status}"}

    product = json_ld_product(parse_json_ld(page))
    raw_body = page.get()
    body_text = re.sub(r"\s+", " ", raw_body.decode("utf-8", errors="replace") if isinstance(raw_body, bytes) else str(raw_body))
    brand = product.get("brand")
    if isinstance(brand, dict):
        brand = brand.get("name")
    offers_price = value_from_offer(product, "price")
    offers_currency = value_from_offer(product, "priceCurrency")
    analytics_match = re.search(
        r'"item_id"\s*:\s*"?(?P<id>[^",}]+)"?[^}]{0,500}?"price"\s*:\s*(?P<price>\d+(?:\.\d+)?)'
        r'[^}]{0,500}?"quantity"\s*:\s*(?P<quantity>\d+(?:\.\d+)?)'
        r'[^}]{0,500}?"measurement_unit"\s*:\s*"(?P<unit>[^"]+)"',
        body_text,
    )
    minimum_match = re.search(r"Quant\.\s*M[íi]nima\s*=\s*([^<]+)", body_text, re.I)
    embedded_unit_price = None
    embedded_unit = None
    embedded_quantity = None
    if analytics_match:
        embedded_unit_price = float(analytics_match.group("price"))
        embedded_unit = analytics_match.group("unit")
        embedded_quantity = float(analytics_match.group("quantity"))
    result = {
        "ok": True,
        "retailer": retailer,
        "url": url,
        "observedAt": observed_at,
        "httpStatus": page.status,
        "productName": product.get("name") or first_text(page, ["h1", "[data-product-name]"]),
        "brand": brand,
        "productId": product.get("sku") or product.get("productID"),
        "ean": product.get("gtin13") or (str(product["gtin"]) if product.get("gtin") is not None else None),
        "packageSize": None,
        "packageUnit": None,
        "displayedPrice": offers_price,
        "currency": offers_currency or "EUR" if offers_price is not None else None,
        "pricePerUnit": ({"amount": embedded_unit_price, "unit": embedded_unit} if embedded_unit_price is not None and embedded_unit else None),
        "promotionalPrice": None,
        "originalPrice": None,
        "availability": value_from_offer(product, "availability"),
        "ingredients": None,
        "allergens": None,
        "nutrition": product.get("nutrition"),
        "weightedProduct": bool(minimum_match),
        "raw": {
            "title": first_text(page, ["title::text", "h1"]),
            "jsonLd": product,
            "minimumQuantityText": minimum_match.group(1).strip() if minimum_match else None,
            "embeddedAnalytics": {
                "productId": analytics_match.group("id") if analytics_match else None,
                "unitPrice": embedded_unit_price,
                "unit": embedded_unit,
                "quantity": embedded_quantity,
            },
        },
    }
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect public Portuguese supermarket observations with Scrapling")
    parser.add_argument("url", nargs="+", help="Public Continente or Pingo Doce product URL")
    parser.add_argument("--output", help="Write JSON array to this path")
    args = parser.parse_args()
    observations = [extract(url) for url in args.url]
    payload = json.dumps(observations, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(payload + "\n")
    else:
        print(payload)
    return 0 if all(item.get("ok") for item in observations) else 1


if __name__ == "__main__":
    raise SystemExit(main())
