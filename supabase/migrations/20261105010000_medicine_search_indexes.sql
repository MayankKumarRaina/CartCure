CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

DROP INDEX IF EXISTS public.idx_medicines_brand_name;
DROP INDEX IF EXISTS public.medicines_salt_composition_trgm_idx;

CREATE INDEX IF NOT EXISTS idx_medicines_brand_name_trgm
  ON public.medicines USING gin (brand_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_medicines_category_search_count
  ON public.medicines (category, search_count DESC NULLS LAST);
