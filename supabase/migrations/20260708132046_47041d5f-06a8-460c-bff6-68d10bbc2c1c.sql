
CREATE TABLE public.demo_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC NOT NULL DEFAULT 1000,
  starting_balance NUMERIC NOT NULL DEFAULT 1000,
  currency TEXT NOT NULL DEFAULT 'USD',
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_accounts TO authenticated;
GRANT ALL ON public.demo_accounts TO service_role;
ALTER TABLE public.demo_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own demo account" ON public.demo_accounts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner inserts own demo account" ON public.demo_accounts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner updates own demo account" ON public.demo_accounts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.demo_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  entry NUMERIC NOT NULL,
  sl NUMERIC NOT NULL,
  tp NUMERIC NOT NULL,
  lot NUMERIC NOT NULL,
  risk_usd NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','TP','SL','EXPIRED','MANUAL')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  closed_at TIMESTAMPTZ,
  exit_price NUMERIC,
  realized_pnl NUMERIC,
  source_type TEXT,
  source_ref TEXT,
  snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_demo_trades_user_status ON public.demo_trades(user_id, status);
CREATE INDEX idx_demo_trades_status_pair ON public.demo_trades(status, pair);
CREATE UNIQUE INDEX idx_demo_trades_unique_open_source
  ON public.demo_trades(user_id, source_type, source_ref)
  WHERE status = 'OPEN' AND source_type IS NOT NULL AND source_ref IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.demo_trades TO authenticated;
GRANT ALL ON public.demo_trades TO service_role;
ALTER TABLE public.demo_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own demo trades" ON public.demo_trades
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner inserts own demo trades" ON public.demo_trades
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner updates own demo trades" ON public.demo_trades
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_demo_accounts_updated
  BEFORE UPDATE ON public.demo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
