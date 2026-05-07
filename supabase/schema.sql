-- ============================================================
-- Personal Finance Dashboard — Supabase schema
-- Run this entire file in the Supabase SQL editor once.
-- ============================================================

-- ── transactions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date        DATE        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('Income', 'Expense')),
  category    TEXT        NOT NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_transactions"
  ON transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── budgets ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category      TEXT        NOT NULL,
  monthly_limit NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_limit >= 0),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, category)
);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_budgets"
  ON budgets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── ai_advice_history ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_advice_history (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model       TEXT,
  focus       TEXT,
  advice      TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_advice_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_advice"
  ON ai_advice_history FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
