"""Export a curated Tata 1mg catalog to a Supabase-compatible CSV.

This reads public pages at a deliberately low request rate. It does not attempt
to evade access controls. Review Tata 1mg's terms and obtain permission where
required before running at scale.

Install: python -m pip install playwright
         python -m playwright install chromium
Run:     python scraper/catalog_export.py --output cartcure_catalog.csv
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


CATEGORIES = [
    {"name": "Diabetes", "url": "https://www.1mg.com/categories/diabetes-1"},
    {"name": "Blood Pressure", "url": "https://www.1mg.com/categories/heart-conditions-97"},
    {"name": "Thyroid", "url": "https://www.1mg.com/categories/thyroid-care-104"},
    {"name": "Vitamins & Supplements", "url": "https://www.1mg.com/categories/fitness-supplements-14"},
]
CSV_HEADERS = [
    "id", "brand_name", "salt_composition", "pack_size", "manufacturer",
    "category", "mrp", "is_rx_required",
]
MRP_RE = re.compile(r"(?:MRP|Maximum Retail Price)\s*:?\s*(?:₹|Rs\.?\s*)([\d,]+(?:\.\d{1,2})?)", re.I)
RX_RE = re.compile(r"prescription\s+(?:required|needed)|schedule\s+(?:h|h1|x)|rx\s+required", re.I)


def jsonld_products(page) -> list[dict]:
    """Return Product JSON-LD objects, when the page exposes them."""
    found: list[dict] = []
    for script in page.locator('script[type="application/ld+json"]').all():
        try:
            payload = json.loads(script.text_content() or "null")
        except (json.JSONDecodeError, TypeError):
            continue
        stack = payload if isinstance(payload, list) else [payload]
        while stack:
            item = stack.pop()
            if isinstance(item, list):
                stack.extend(item)
            elif isinstance(item, dict):
                if isinstance(item.get("@graph"), list):
                    stack.extend(item["@graph"])
                kind = item.get("@type", [])
                if kind == "Product" or (isinstance(kind, list) and "Product" in kind):
                    found.append(item)
    return found


def product_links(page) -> list[str]:
    links = page.locator('a[href*="/drugs/"], a[href*="/otc/"]').evaluate_all(
        "els => els.map(a => a.href)"
    )
    return list(dict.fromkeys(links))


def extract_detail(page, url: str, category: str) -> dict | None:
    try:
        response = page.goto(url, wait_until="domcontentloaded", timeout=45000)
        if response and response.status >= 400:
            print(f"  Skipping HTTP {response.status}: {url}")
            return None
        page.locator("body").wait_for(timeout=15000)
        title = (page.locator("h1").first.text_content() or "").strip()
        body = page.locator("body").inner_text(timeout=10000)
    except (PlaywrightTimeoutError, Exception) as exc:
        print(f"  Could not read {url}: {exc}")
        return None

    if not title:
        return None

    # Prefer structured product data, with visible-detail labels as fallback.
    product = next(iter(jsonld_products(page)), {})
    name = str(product.get("name") or title).strip()
    brand = product.get("brand")
    manufacturer = brand.get("name", "") if isinstance(brand, dict) else (str(brand or ""))
    if not manufacturer:
        match = re.search(r"(?:Manufacturer|Marketer)\s*:?\s*([^\n]+)", body, re.I)
        manufacturer = match.group(1).strip() if match else ""

    # Product pages commonly show salt/composition and pack as labeled rows.
    def labeled(*labels: str) -> str:
        for label in labels:
            m = re.search(rf"(?:{label})\s*:?\s*([^\n]+)", body, re.I)
            if m:
                return m.group(1).strip()
        return ""

    salt = labeled("Salt Composition", "Composition", "Contains")
    pack = labeled("Pack Size", "Pack of", "Package")
    mrp_match = MRP_RE.search(body)
    mrp = float(mrp_match.group(1).replace(",", "")) if mrp_match else None
    if not mrp or mrp <= 0:
        print(f"  Skipping product without a readable positive MRP: {url}")
        return None

    # Leave unknown facts blank. Never infer composition or prescription status.
    return {
        "id": "", "brand_name": name, "salt_composition": salt,
        "pack_size": pack, "manufacturer": manufacturer, "category": category,
        "mrp": mrp, "is_rx_required": "TRUE" if RX_RE.search(body) else "FALSE",
    }


def run(output: Path, max_pages: int, delay: float, limit: int | None) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    seen: set[str] = set()
    count = 0
    with output.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=CSV_HEADERS)
        writer.writeheader()
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            context = browser.new_context(locale="en-IN")
            listing = context.new_page()
            detail = context.new_page()
            try:
                for category in CATEGORIES:
                    print(f"--- {category['name']} ---")
                    for page_num in range(1, max_pages + 1):
                        separator = "&" if "?" in category["url"] else "?"
                        url = f"{category['url']}{separator}pageNumber={page_num}"
                        try:
                            response = listing.goto(url, wait_until="domcontentloaded", timeout=45000)
                            if response and response.status >= 400:
                                print(f"HTTP {response.status}; stopping category")
                                break
                            listing.locator("body").wait_for(timeout=15000)
                            links = product_links(listing)
                        except Exception as exc:
                            print(f"Listing failed ({url}): {exc}")
                            break
                        if not links:
                            print("No product detail links found; stopping category.")
                            break
                        fresh = [link for link in links if link not in seen]
                        print(f"Page {page_num}: {len(fresh)} new product links")
                        if not fresh:
                            break
                        for link in fresh:
                            seen.add(link)
                            row = extract_detail(detail, link, category["name"])
                            if row:
                                writer.writerow(row)
                                file.flush()
                                count += 1
                                print(f"  Saved {row['brand_name']}")
                            time.sleep(delay)
                            if limit is not None and count >= limit:
                                print(f"Reached requested limit ({limit}).")
                                return
                        time.sleep(delay)
            finally:
                browser.close()
    print(f"Exported {count} products to {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("cartcure_catalog.csv"))
    parser.add_argument("--max-pages", type=int, default=20)
    parser.add_argument("--delay", type=float, default=4.0, help="Seconds between page requests (minimum 2).")
    parser.add_argument("--limit", type=int, help="Optional maximum accepted rows; useful for a small trial run.")
    args = parser.parse_args()
    if args.max_pages < 1 or args.delay < 2 or (args.limit is not None and args.limit < 1):
        parser.error("max-pages and limit must be positive; delay must be at least 2 seconds")
    run(args.output, args.max_pages, args.delay, args.limit)
