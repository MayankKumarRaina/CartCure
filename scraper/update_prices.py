import os
import asyncio
import re
import random
import math
from datetime import datetime
from urllib.parse import quote
from playwright.async_api import async_playwright
from supabase import create_client, Client

SUPABASE_URL = "https://sofowqilxmplbfownnqh.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def build_platform_urls(query: str) -> dict:
    clean = re.sub(r"\b(Tablet|Capsule|PR)\b", "", query, flags=re.IGNORECASE).strip()
    enc = quote(clean)
    return {
        "Tata 1mg": f"https://www.1mg.com/search/all?name={enc}",
        "PharmEasy": f"https://pharmeasy.in/search/all?name={enc}",
        "Netmeds": f"https://www.netmeds.com/catalogsearch/result/{enc}/all",
        "Apollo Pharmacy": f"https://www.apollopharmacy.in/search-medicines/{enc}",
        "Truemeds": f"https://www.truemeds.in/search?q={enc}",
    }

async def human_jitter():
    # Random pause between 8 and 18 seconds to mimic human browsing
    jitter = random.uniform(8, 18)
    print(f"    [Jitter] Sleeping {jitter:.1f}s...")
    await asyncio.sleep(jitter)

async def scrape_price(page, url: str, mrp: float, platform: str) -> float | None:
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)
        body = await page.inner_text("body")
        
        matches = re.findall(r"₹\s*(\d+(?:\.\d{1,2})?)", body)
        valid = [float(m) for m in matches if (mrp * 0.35) <= float(m) <= (mrp * 1.05)]
        return min(valid) if valid else None
    except Exception as e:
        print(f"  [!] {platform} timeout/blocked: {e}")
        return None

async def scrape_memberships(page):
    """Automatically detects live membership prices for Tata 1mg and PharmEasy."""
    print("\n--- Auto-Detecting Membership Prices ---")
    
    # 1. Tata 1mg Auto-Detection
    try:
        await page.goto("https://www.1mg.com/careplan", wait_until="domcontentloaded", timeout=30000)
        await human_jitter()
        body = await page.inner_text("body")
        
        if "165" in body or "165/3 months" in body:
            supabase.table("platform_memberships").update({"fee": 165, "duration_months": 3}).eq("platform_name", "Tata 1mg").execute()
            print("  -> Tata 1mg: Detected ₹165 / 3 Months")
        elif "275" in body or "275/6 months" in body:
            supabase.table("platform_memberships").update({"fee": 275, "duration_months": 6}).eq("platform_name", "Tata 1mg").execute()
            print("  -> Tata 1mg: Detected ₹275 / 6 Months")
    except Exception as e:
        print(f"  [!] Failed to auto-detect 1mg membership: {e}")

    # 2. PharmEasy Auto-Detection
    try:
        # Step A: Check the main PLUS landing page for standard tiers
        await page.goto("https://pharmeasy.in/plus", wait_until="domcontentloaded", timeout=30000)
        await human_jitter()
        plus_body = await page.inner_text("body")
        
        if "399" in plus_body and "6 Months" in plus_body:
            supabase.table("platform_memberships").update({"fee": 399, "duration_months": 6}).eq("platform_name", "PharmEasy").execute()
            print("  -> PharmEasy: Detected ₹399 / 6 Months (Landing Page)")
        elif "249" in plus_body and "3 Months" in plus_body:
            supabase.table("platform_memberships").update({"fee": 249, "duration_months": 3}).eq("platform_name", "PharmEasy").execute()
            print("  -> PharmEasy: Detected ₹249 / 3 Months (Landing Page)")
        else:
            # Step B: Fallback to the Cart Upsell Widget (from your screenshot)
            await page.goto("https://pharmeasy.in/cart", wait_until="domcontentloaded", timeout=30000)
            await human_jitter()
            cart_body = await page.inner_text("body")
            
            # This regex actively hunts for the "Add for 2 Months at ₹149" text pattern
            match = re.search(r"Add for (\d+)\s*[Mm]onths? at (?:₹|Rs\.?\s*)(\d+)", cart_body)
            if match:
                duration = int(match.group(1))
                fee = int(match.group(2))
                supabase.table("platform_memberships").update({"fee": fee, "duration_months": duration}).eq("platform_name", "PharmEasy").execute()
                print(f"  -> PharmEasy: Detected ₹{fee} / {duration} Months (Cart Widget)")
            else:
                print("  -> PharmEasy: Could not detect live plan, retaining existing database value.")
    except Exception as e:
        print(f"  [!] Failed to auto-detect PharmEasy membership: {e}")
        
async def main():
    # 1. Fetch total catalog
    response = supabase.table("medicines").select("id, brand_name, mrp").execute()
    all_meds = response.data or []
    total_meds = len(all_meds)
    
    # 2. The 14-Chunk Mathematical Split
    # day_of_week is 0-6. current_hour dictates if it is the AM (0) or PM (1) run.
    now = datetime.utcnow()
    day_of_week = now.weekday()
    is_pm_run = 1 if now.hour >= 12 else 0
    
    chunk_index = (day_of_week * 2) + is_pm_run
    chunk_size = math.ceil(total_meds / 14)
    
    start_idx = chunk_index * chunk_size
    end_idx = min(start_idx + chunk_size, total_meds)
    chunk_meds = all_meds[start_idx:end_idx]
    
    print(f"Total Catalog: {total_meds} | Chunk Index: {chunk_index}/13 | Processing {len(chunk_meds)} items")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        page = await context.new_page()

        # Run Membership Auto-Detection first
        if chunk_index == 0: 
            # Only check membership prices once a week (Monday AM) to save time
            await scrape_memberships(page)

        # Process this chunk's medicines
        for med in chunk_meds:
            med_id, name, mrp = med["id"], med["brand_name"], float(med["mrp"])
            print(f"\nChecking {name} (MRP: ₹{mrp})...")

            for platform, deep_url in build_platform_urls(name).items():
                price = await scrape_price(page, deep_url, mrp, platform)
                
                payload = {
                    "medicine_id": med_id,
                    "platform_name": platform,
                    "product_url": deep_url,
                    "selling_price": price if price else mrp
                }
                
                supabase.table("pharmacy_prices").upsert(payload, on_conflict="medicine_id, platform_name").execute()
                print(f"  -> {platform}: ₹{payload['selling_price']} [Upserted]")

                # Apply human jitter after every single platform request
                await human_jitter()

        await browser.close()
        print(f"\nCompleted chunk {chunk_index} successfully.")

if __name__ == "__main__":
    asyncio.run(main())