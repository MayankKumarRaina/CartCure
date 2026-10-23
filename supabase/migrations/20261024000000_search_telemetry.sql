ALTER TABLE public.medicines
  ADD COLUMN IF NOT EXISTS search_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.increment_search_count(medicine_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  UPDATE public.medicines AS medicine
  SET search_count = COALESCE(medicine.search_count, 0) + 1
  WHERE medicine.id = $1;
$function$;

REVOKE ALL ON FUNCTION public.increment_search_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_search_count(uuid) TO anon, authenticated;

WITH ranked_duplicates AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY medicine_id, platform_name
      ORDER BY updated_at DESC NULLS LAST, ctid DESC
    ) AS row_number
  FROM public.pharmacy_prices
)
DELETE FROM public.pharmacy_prices AS price
USING ranked_duplicates AS duplicate
WHERE price.ctid = duplicate.ctid
  AND duplicate.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_prices_medicine_platform_unique
  ON public.pharmacy_prices (medicine_id, platform_name);
