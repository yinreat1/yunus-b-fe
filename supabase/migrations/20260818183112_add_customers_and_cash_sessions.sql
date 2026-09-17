/*
# Müşteriler ve Kasa (Gün Sonu) Tabloları

1. Yeni Tablolar
- `customers`: Müşteri/carileri tutar
  - id (uuid, primary key)
  - name (text, müşteri adı)
  - phone (text, telefon)
  - balance (numeric, cari bakiye - veresiye toplamı)
  - created_at (timestamp)

- `cash_sessions`: Kasa oturumları (gün sonu raporu için)
  - id (uuid, primary key)
  - opening_amount (numeric, açılış nakiti)
  - closing_amount (numeric, kapanış nakiti - null ise açık)
  - status (text: 'open' | 'closed')
  - opened_at (timestamp, açılış zamanı)
  - closed_at (timestamp, kapanış zamanı - null ise açık)
  - note (text, not)

2. Güvenlik
- Her iki tabloda da RLS aktif.
- No-auth uygulama olduğu için anon + authenticated tüm CRUD yetkisine sahip.

3. Önemli Notlar
- customers.balance alanı veresiye satışlarla güncellenir.
- cash_sessions aynı anda sadece bir tane 'open' oturum olmalı.
*/

-- Müşteriler tablosu
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  balance numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE
  TO anon, authenticated USING (true);

-- Kasa oturumları tablosu
CREATE TABLE IF NOT EXISTS cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opening_amount numeric(10,2) NOT NULL DEFAULT 0,
  closing_amount numeric(10,2),
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,
  note text
);

ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_cash_sessions" ON cash_sessions;
CREATE POLICY "anon_select_cash_sessions" ON cash_sessions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_cash_sessions" ON cash_sessions;
CREATE POLICY "anon_insert_cash_sessions" ON cash_sessions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_cash_sessions" ON cash_sessions;
CREATE POLICY "anon_update_cash_sessions" ON cash_sessions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_cash_sessions" ON cash_sessions;
CREATE POLICY "anon_delete_cash_sessions" ON cash_sessions FOR DELETE
  TO anon, authenticated USING (true);

-- sales tablosuna customer_id ekle (veresiye satışları müşteriye bağla)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'customer_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_status ON cash_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sales_customer_id ON sales(customer_id);
