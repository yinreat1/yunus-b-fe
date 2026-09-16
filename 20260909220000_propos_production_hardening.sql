-- ProPOS Production Hardening v13
-- Safe, additive migration. Does not delete existing business data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS businesses_public_read ON businesses;
CREATE POLICY businesses_public_read ON businesses FOR SELECT TO anon, authenticated USING (active = true);
DROP POLICY IF EXISTS businesses_public_write ON businesses;
CREATE POLICY businesses_public_write ON businesses FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO businesses (id,name)
SELECT gen_random_uuid(),'FERHAT BÜFE'
WHERE NOT EXISTS (SELECT 1 FROM businesses);

CREATE TABLE IF NOT EXISTS business_members (
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','admin','manager','cashier')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id,user_id)
);
ALTER TABLE business_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_members_self ON business_members;
CREATE POLICY business_members_self ON business_members FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS store_settings (
  business_id uuid PRIMARY KEY REFERENCES businesses(id) ON DELETE CASCADE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS store_settings_public_read ON store_settings;
CREATE POLICY store_settings_public_read ON store_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS store_settings_auth_write ON store_settings;
CREATE POLICY store_settings_auth_write ON store_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO store_settings (business_id,settings)
SELECT id, jsonb_build_object('storeName',name,'storeAddress',COALESCE(address,''),'storePhone',COALESCE(phone,''),'currency','TRY','receiptFooter','Bizi tercih ettiğiniz için teşekkürler!','taxRate','0','lowStockDefault','0')
FROM businesses b
WHERE NOT EXISTS (SELECT 1 FROM store_settings s WHERE s.business_id=b.id);

DO $$
DECLARE bid uuid;
BEGIN
  SELECT id INTO bid FROM businesses ORDER BY created_at LIMIT 1;
  IF bid IS NULL THEN RETURN; END IF;
  ALTER TABLE categories ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE RESTRICT;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE RESTRICT;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE RESTRICT;
  ALTER TABLE sales ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE RESTRICT;
  ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE RESTRICT;
  ALTER TABLE staff ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE RESTRICT;
  ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE RESTRICT;
  ALTER TABLE product_price_history ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id) ON DELETE RESTRICT;
END $$;

DO $$
DECLARE bid uuid;
BEGIN
  SELECT id INTO bid FROM businesses ORDER BY created_at LIMIT 1;
  UPDATE categories SET business_id=bid WHERE business_id IS NULL;
  UPDATE products SET business_id=bid WHERE business_id IS NULL;
  UPDATE customers SET business_id=bid WHERE business_id IS NULL;
  UPDATE sales SET business_id=bid WHERE business_id IS NULL;
  UPDATE cash_sessions SET business_id=bid WHERE business_id IS NULL;
  UPDATE staff SET business_id=bid WHERE business_id IS NULL;
  UPDATE audit_logs SET business_id=bid WHERE business_id IS NULL;
  UPDATE product_price_history SET business_id=bid WHERE business_id IS NULL;
END $$;

CREATE OR REPLACE FUNCTION public.get_default_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT id FROM public.businesses WHERE active=true ORDER BY created_at LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_default_business_id() TO anon, authenticated;

ALTER TABLE categories ALTER COLUMN business_id SET DEFAULT public.get_default_business_id();
ALTER TABLE products ALTER COLUMN business_id SET DEFAULT public.get_default_business_id();
ALTER TABLE customers ALTER COLUMN business_id SET DEFAULT public.get_default_business_id();
ALTER TABLE sales ALTER COLUMN business_id SET DEFAULT public.get_default_business_id();
ALTER TABLE cash_sessions ALTER COLUMN business_id SET DEFAULT public.get_default_business_id();
ALTER TABLE staff ALTER COLUMN business_id SET DEFAULT public.get_default_business_id();
ALTER TABLE audit_logs ALTER COLUMN business_id SET DEFAULT public.get_default_business_id();
ALTER TABLE product_price_history ALTER COLUMN business_id SET DEFAULT public.get_default_business_id();

CREATE INDEX IF NOT EXISTS idx_categories_business ON categories(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_business_created ON sales(business_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_business ON cash_sessions(business_id,opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_business ON staff(business_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_business_created ON audit_logs(business_id,created_at DESC);

-- Business-scoped helper used by reports/backup without imposing auth on the current single-store deployment.
CREATE OR REPLACE FUNCTION public.report_summary(p_start timestamptz, p_end timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  bid uuid := public.get_default_business_id();
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'revenue',COALESCE(SUM(s.total),0),
    'sales_count',COUNT(*),
    'cash',COALESCE(SUM(CASE WHEN s.payment_method='cash' THEN s.total ELSE 0 END),0),
    'card',COALESCE(SUM(CASE WHEN s.payment_method='card' THEN s.total ELSE 0 END),0),
    'credit',COALESCE(SUM(CASE WHEN s.payment_method='credit' THEN s.total ELSE 0 END),0),
    'split',COALESCE(SUM(CASE WHEN s.payment_method='split' THEN s.total ELSE 0 END),0),
    'discount',COALESCE(SUM(s.discount_total),0),
    'refund',COALESCE(SUM(COALESCE(s.refund_amount,0)),0)
  ) INTO result
  FROM sales s
  WHERE s.business_id=bid AND s.created_at>=p_start AND s.created_at<p_end AND s.deleted_at IS NULL;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.report_summary(timestamptz,timestamptz) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.report_product_performance(p_start timestamptz, p_end timestamptz DEFAULT now())
RETURNS TABLE(product_id uuid, product_name text, quantity numeric, revenue numeric) LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT si.product_id, si.product_name, SUM(si.quantity) quantity, SUM(si.subtotal) revenue
  FROM sale_items si
  JOIN sales s ON s.id=si.sale_id
  WHERE s.business_id=public.get_default_business_id()
    AND s.created_at>=p_start AND s.created_at<p_end
    AND s.deleted_at IS NULL
  GROUP BY si.product_id, si.product_name
  ORDER BY SUM(si.quantity) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.report_product_performance(timestamptz,timestamptz) TO anon, authenticated;

-- Make key audit records business scoped on inserts when omitted.
CREATE OR REPLACE FUNCTION public.audit_business_default()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.business_id IS NULL THEN NEW.business_id := public.get_default_business_id(); END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS audit_logs_business_default ON audit_logs;
CREATE TRIGGER audit_logs_business_default BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_business_default();
DROP TRIGGER IF EXISTS categories_business_default ON categories;
CREATE TRIGGER categories_business_default BEFORE INSERT ON categories FOR EACH ROW EXECUTE FUNCTION public.audit_business_default();
DROP TRIGGER IF EXISTS products_business_default ON products;
CREATE TRIGGER products_business_default BEFORE INSERT ON products FOR EACH ROW EXECUTE FUNCTION public.audit_business_default();
DROP TRIGGER IF EXISTS customers_business_default ON customers;
CREATE TRIGGER customers_business_default BEFORE INSERT ON customers FOR EACH ROW EXECUTE FUNCTION public.audit_business_default();
DROP TRIGGER IF EXISTS sales_business_default ON sales;
CREATE TRIGGER sales_business_default BEFORE INSERT ON sales FOR EACH ROW EXECUTE FUNCTION public.audit_business_default();
DROP TRIGGER IF EXISTS staff_business_default ON staff;
CREATE TRIGGER staff_business_default BEFORE INSERT ON staff FOR EACH ROW EXECUTE FUNCTION public.audit_business_default();
DROP TRIGGER IF EXISTS cash_sessions_business_default ON cash_sessions;
CREATE TRIGGER cash_sessions_business_default BEFORE INSERT ON cash_sessions FOR EACH ROW EXECUTE FUNCTION public.audit_business_default();

NOTIFY pgrst, 'reload schema';

-- Default-store scoping for the current single-business deployment.
-- The app uses one active business today; these policies prevent accidental
-- cross-business reads if another business record is later introduced.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','products','customers','sales','cash_sessions','staff','audit_logs','product_price_history'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_business_scope ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_business_scope ON %I FOR SELECT TO anon, authenticated USING (business_id = public.get_default_business_id())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_business_write_scope ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_business_write_scope ON %I FOR INSERT TO anon, authenticated WITH CHECK (business_id = public.get_default_business_id())', t, t);
  END LOOP;
END $$;

-- Replace the broad default policies on business-scoped tables with scoped policies.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('categories','products','customers','sales','cash_sessions','staff','audit_logs','product_price_history') AND policyname NOT LIKE '%business_scope' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p.policyname, p.tablename);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','products','customers','sales','cash_sessions','staff','audit_logs','product_price_history'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_business_update_scope ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_business_update_scope ON %I FOR UPDATE TO anon, authenticated USING (business_id = public.get_default_business_id()) WITH CHECK (business_id = public.get_default_business_id())', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_business_delete_scope ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_business_delete_scope ON %I FOR DELETE TO anon, authenticated USING (business_id = public.get_default_business_id())', t, t);
  END LOOP;
END $$;

-- Child tables are reachable only through a sale/customer/product already scoped above.
DROP POLICY IF EXISTS sale_items_scope ON sale_items;
CREATE POLICY sale_items_scope ON sale_items FOR SELECT TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id())
);
DROP POLICY IF EXISTS sale_items_insert_scope ON sale_items;
CREATE POLICY sale_items_insert_scope ON sale_items FOR INSERT TO anon, authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id())
);
DROP POLICY IF EXISTS sale_items_update_scope ON sale_items;
CREATE POLICY sale_items_update_scope ON sale_items FOR UPDATE TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id())
) WITH CHECK (
  EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id())
);
DROP POLICY IF EXISTS sale_items_delete_scope ON sale_items;
CREATE POLICY sale_items_delete_scope ON sale_items FOR DELETE TO anon, authenticated USING (
  EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id())
);

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
  -- customer payments through customer
  DROP POLICY IF EXISTS customer_payments_all ON customer_payments;
  CREATE POLICY customer_payments_scope ON customer_payments FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id())
  );
  CREATE POLICY customer_payments_insert_scope ON customer_payments FOR INSERT TO anon, authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id())
  );
  CREATE POLICY customer_payments_update_scope ON customer_payments FOR UPDATE TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id())
  );
  CREATE POLICY customer_payments_delete_scope ON customer_payments FOR DELETE TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id())
  );

  -- sale payments / returns / movements through sale
  DROP POLICY IF EXISTS sale_payments_all ON sale_payments;
  CREATE POLICY sale_payments_scope ON sale_payments FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id())
  );
  CREATE POLICY sale_payments_insert_scope ON sale_payments FOR INSERT TO anon, authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id())
  );
  CREATE POLICY sale_payments_update_scope ON sale_payments FOR UPDATE TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id())
  );
  CREATE POLICY sale_payments_delete_scope ON sale_payments FOR DELETE TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id())
  );

  DROP POLICY IF EXISTS stock_movements_all ON stock_movements;
  CREATE POLICY stock_movements_scope ON stock_movements FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id())
    OR stock_movements.product_id IS NULL
  );
  CREATE POLICY stock_movements_insert_scope ON stock_movements FOR INSERT TO anon, authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id())
    OR stock_movements.product_id IS NULL
  );
  CREATE POLICY stock_movements_update_scope ON stock_movements FOR UPDATE TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id())
    OR stock_movements.product_id IS NULL
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id())
    OR stock_movements.product_id IS NULL
  );
  CREATE POLICY stock_movements_delete_scope ON stock_movements FOR DELETE TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id())
    OR stock_movements.product_id IS NULL
  );

  DROP POLICY IF EXISTS sale_returns_all ON sale_returns;
  CREATE POLICY sale_returns_scope ON sale_returns FOR SELECT TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id())
  );
  CREATE POLICY sale_returns_insert_scope ON sale_returns FOR INSERT TO anon, authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id())
  );
  CREATE POLICY sale_returns_update_scope ON sale_returns FOR UPDATE TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id())
  );
  CREATE POLICY sale_returns_delete_scope ON sale_returns FOR DELETE TO anon, authenticated USING (
    EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id())
  );
END $$;

NOTIFY pgrst, 'reload schema';
