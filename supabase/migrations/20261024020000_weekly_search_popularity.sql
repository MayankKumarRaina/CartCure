CREATE TABLE IF NOT EXISTS public.search_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  medicine_id uuid NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_log_created_at
  ON public.search_log (created_at);

CREATE INDEX IF NOT EXISTS idx_search_log_medicine_created_at
  ON public.search_log (medicine_id, created_at);

ALTER TABLE public.search_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.increment_search_count(medicine_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  UPDATE public.medicines AS medicine
  SET search_count = COALESCE(medicine.search_count, 0) + 1
  WHERE medicine.id = $1;

  INSERT INTO public.search_log (medicine_id)
  VALUES ($1);
END;
$function$;

REVOKE ALL ON FUNCTION public.increment_search_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_search_count(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_weekly_popular_medicines()
RETURNS TABLE (medicine_id uuid, category text, weekly_searches bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH weekly_counts AS (
    SELECT log.medicine_id, COUNT(*) AS weekly_searches
    FROM public.search_log AS log
    WHERE log.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY log.medicine_id
  ),
  ranked_medicines AS (
    SELECT
      medicine.id AS medicine_id,
      medicine.category,
      weekly_counts.weekly_searches,
      ROW_NUMBER() OVER (
        PARTITION BY medicine.category
        ORDER BY weekly_counts.weekly_searches DESC, medicine.id
      ) AS category_rank
    FROM weekly_counts
    JOIN public.medicines AS medicine ON medicine.id = weekly_counts.medicine_id
  )
  SELECT ranked_medicines.medicine_id, ranked_medicines.category, ranked_medicines.weekly_searches
  FROM ranked_medicines
  WHERE ranked_medicines.category_rank <= 50;
$function$;

REVOKE ALL ON FUNCTION public.get_weekly_popular_medicines() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_weekly_popular_medicines() TO service_role;
