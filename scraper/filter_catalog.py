import pandas as pd
import glob
import os

print("Searching for raw dataset CSV...")
csv_files = [f for f in glob.glob("**/*.csv", recursive=True) if "cartcure" not in f.lower() and "supabase" not in f.lower()]
if not csv_files: raise FileNotFoundError("Raw CSV file not found.")

raw_file = max(csv_files, key=os.path.getsize)
print(f"Loading {raw_file}...")

df = pd.read_csv(raw_file, low_memory=False)

def find_col(possible_names):
    for col in df.columns:
        if any(name.lower() in col.lower() for name in possible_names): return col
    return None

col_name = find_col(["medicine name", "product name", "brand"])
col_price = find_col(["price", "mrp"])
col_rx = find_col(["prescription", "is prescripti", "rx"])
col_pack = find_col(["type of me", "pack", "unit"])
col_salt = find_col(["composition", "salt"])
col_mfr = find_col(["manufacturer", "marketer"])

# Clean Price
df["mrp"] = df[col_price].astype(str).str.replace("₹", "", regex=False).str.replace(",", "", regex=False).str.strip()
df["mrp"] = pd.to_numeric(df["mrp"], errors="coerce")
df = df.dropna(subset=["mrp", col_name, col_salt])

# Clean the Brand Name instantly (Splitting at 'MRP')
df["brand_name"] = df[col_name].astype(str).apply(lambda x: x.split("MRP")[0].strip())

# Map remaining Supabase columns
df["salt_composition"] = df[col_salt].astype(str).str.replace("ADD", "", regex=False).str.strip()
df["pack_size"] = df[col_pack].fillna("1 Strip").astype(str).str.strip() if col_pack else "1 Strip"
df["manufacturer"] = df[col_mfr].fillna("Standard Pharma").astype(str).str.strip() if col_mfr else "Standard Pharma"
df["is_rx_required"] = df[col_rx].astype(str).str.upper().str.strip() == "TRUE" if col_rx else True

# We categorize what we can, but keep EVERYTHING
CATEGORY_KEYWORDS = {
    "Diabetes": ["metformin", "glimepiride", "sitagliptin", "vildagliptin", "dapagliflozin", "empagliflozin", "insulin"],
    "Blood Pressure": ["telmisartan", "amlodipine", "losartan", "olmesartan", "cilnidipine", "ramipril", "metoprolol"],
    "Heart Care": ["rosuvastatin", "atorvastatin", "clopidogrel", "aspirin", "fenofibrate"],
    "Thyroid": ["thyroxine", "levothyroxine"],
    "Vitamins & Supplements": ["cholecalciferol", "methylcobalamin", "calcium", "vitamin d3", "omega", "multivitamin"],
    "Stomach Care": ["pantoprazole", "omeprazole", "rabeprazole", "domperidone", "esomeprazole"],
    "Pain Relief": ["paracetamol", "aceclofenac", "diclofenac", "ibuprofen", "etoricoxib"],
    "Respiratory Care": ["levosalbutamol", "budesonide", "formoterol", "montelukast", "fexofenadine"]
}

def map_category(salt_text):
    s = str(salt_text).lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        if any(k in s for k in keywords): return cat
    return "General" # Catch-all for the remaining 300k medicines

df["category"] = df[col_salt].apply(map_category)
df = df.drop_duplicates(subset=["brand_name"])

final_cols = ["brand_name", "salt_composition", "pack_size", "manufacturer", "category", "mrp", "is_rx_required"]
df_final = df[final_cols]

output_path = "cartcure_full.csv"
df_final.to_csv(output_path, index=False, encoding="utf-8")
print(f"Success! Generated {output_path} with {len(df_final):,} rows.")