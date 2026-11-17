#!/usr/bin/env python3
"""Quarantined Scrapling entry point.

External retailer fetching is intentionally disabled by SmartBasket policy.
This file is retained as a record of the integration boundary, but it never
performs a request and never emits a price observation.
"""

import argparse
import json
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Disabled SmartBasket Scrapling worker")
    parser.add_argument("--json", action="store_true")
    parser.parse_args()
    payload = {
        "ok": False,
        "error": "A recolha externa está desactivada. Introduza ou importe os preços localmente.",
        "code": "EXTERNAL_PRICING_DISABLED",
    }
    print(json.dumps(payload, ensure_ascii=False))
    return 2


if __name__ == "__main__":
    sys.exit(main())
