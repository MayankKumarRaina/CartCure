CREATE TABLE IF NOT EXISTS public.affiliate_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id text NOT NULL,
  is_affiliate boolean NOT NULL,
  medicine_id text,
  medicine_name text,
  clicked_price numeric,
  source_component text NOT NULL,
  basket_size integer,
  referrer text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_clicks_clicked_price_nonnegative
    CHECK (clicked_price IS NULL OR clicked_price >= 0),
  CONSTRAINT affiliate_clicks_basket_size_nonnegative
    CHECK (basket_size IS NULL OR basket_size >= 0)
);

CREATE INDEX IF NOT EXISTS affiliate_clicks_created_at_idx
  ON public.affiliate_clicks (created_at DESC);

ALTER TABLE public.affiliate_clicks ENABLE ROW LEVEL SECURITY;
