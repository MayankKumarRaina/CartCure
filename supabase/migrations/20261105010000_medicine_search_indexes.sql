CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS medicines_brand_name_trgm_idx
  ON public.medicines USING gin (brand_name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS medicines_salt_composition_trgm_idx
  ON public.medicines USING gin (salt_composition extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS medicines_popular_search_idx
  ON public.medicines (search_count DESC, id ASC);

CREATE INDEX IF NOT EXISTS medicines_category_popular_search_idx
  ON public.medicines (category, search_count DESC, id ASC);
