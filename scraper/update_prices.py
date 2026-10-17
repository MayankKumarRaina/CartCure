import asyncio
import re
from urllib.parse import quote
from playwright.async_api import async_playwright
from supabase import create_client, Client

# Your existing Supabase connection
SUPABASE_URL = "https://sofowqilxmplbfownnqh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvZm93cWlseG1wbGJmb3dubnFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyMzA1MDcsImV4cCI6MjEwNzgwNjUwN30.18rDg6X-3eJx1N9jHgbPCdZhYt5m23OiaL9DBQ73qE4"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def build_platform_urls(query: str) -> dict:
    # Clean the brand name for better search hits
    clean_query = re.sub(r"\b(Tablet|Capsule|PR)\b", "", query, flags=re.IGNORECASE).strip()
    encoded = quote(clean_query)
    
    # Expanded Platform Roster
    return {
        "Tata 1mg": f"https://www.1mg.com/search/all?name={encoded}",
        "PharmEasy": f"https://pharmeasy.in/search/all?name={encoded}",
        "Netmeds": f"https://www.netmeds.com/catalogsearch/result/{encoded}/all",
        "Apollo Pharmacy": f"https://www.apollopharmacy.in/search-medicines/{encoded}",
        "Truemeds": f"https://www.truemeds.in/search?q={encoded}",
        "MedPlus": f"https://www.medplusmart.com/search/{encoded}"
    }

def extract_reasonable_price(text: str, mrp: float) -> float | None:
    if not text:
        return None
    matches = re.findall(r"₹\s*(\d+(?:\.\d{1,2})?)", text)
    # Filter out shipping banners or unrelated numbers by checking 35% to 105% of MRP
    valid_prices = [
        float(m) for m in matches
        if (mrp * 0.35) <= float(m) <= (mrp * 1.05)
    ]
    return min(valid_prices) if valid_prices else None

async def scrape_price(page, url: str, mrp: float, platform: str) -> float | None:
    try:
        # Navigate to the deep search link
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await page.wait_for_timeout(3000) # Allow JavaScript rendering
        body_text = await page.inner_text("body")
        return extract_reasonable_price(body_text, mrp)
    except Exception as e:
        print(f"  [!] {platform} error/timeout: {e}")
        return None

async def main():
    # Fetch your entire catalog from Supabase
    response = supabase.table("medicines").select("id, brand_name, mrp").execute()
    medicines = response.data or []
    print(f"Loaded {len(medicines)} medicines from Supabase.\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        )
        page = await context.new_page()

        for med in medicines:
            med_id = med["id"]
            name = med["brand_name"]
            mrp = float(med["mrp"])
            urls = build_platform_urls(name)
            print(f"Checking {name} (MRP: ₹{mrp})...")

            for platform, deep_url in urls.items():
                scraped_price = await scrape_price(page, deep_url, mrp, platform)
                
                # We always update the URL so the checkout button points to the right place
                update_payload = {"product_url": deep_url}
                
                if scraped_price:
                    update_payload["selling_price"] = scraped_price
                    print(f"  -> {platform}: ₹{scraped_price} [Deep URL Updated]")
                else:
                    print(f"  -> {platform}: Bot check blocked or price not found [Deep URL Updated]")

                # Upsert logic: if the platform row doesn't exist for this medicine, create it; if it does, update it.
                # In Supabase Python client, we first try to update. If no rows match, we insert.
                update_res = supabase.table("pharmacy_prices").update(update_payload).eq("medicine_id", med_id).eq("platform_name", platform).execute()
                
                if not update_res.data:
                    # Row doesn't exist yet, insert it
                    insert_payload = {
                        "medicine_id": med_id,
                        "platform_name": platform,
                        "product_url": deep_url,
                        "selling_price": scraped_price if scraped_price else mrp # Default to MRP if scrape fails on first run
                    }
                    supabase.table("pharmacy_prices").insert(insert_payload).execute()

        await browser.close()
        print("\nAll medicines and 6 competitor platforms updated in Supabase!")

if __name__ == "__main__":
    asyncio.run(main())