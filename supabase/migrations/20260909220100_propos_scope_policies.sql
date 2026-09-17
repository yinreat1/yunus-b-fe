-- Scope all data to the single active ProPOS business context.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('categories','products','customers','sales','cash_sessions','staff','audit_logs','product_price_history','sale_items','customer_payments','sale_payments','stock_movements','sale_returns') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p.policyname, p.tablename);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories','products','customers','sales','cash_sessions','staff','audit_logs','product_price_history'] LOOP
    EXECUTE format('CREATE POLICY %I_business_select ON %I FOR SELECT TO anon,authenticated USING (business_id=public.get_default_business_id())', t,t);
    EXECUTE format('CREATE POLICY %I_business_insert ON %I FOR INSERT TO anon,authenticated WITH CHECK (business_id=public.get_default_business_id())', t,t);
    EXECUTE format('CREATE POLICY %I_business_update ON %I FOR UPDATE TO anon,authenticated USING (business_id=public.get_default_business_id()) WITH CHECK (business_id=public.get_default_business_id())', t,t);
    EXECUTE format('CREATE POLICY %I_business_delete ON %I FOR DELETE TO anon,authenticated USING (business_id=public.get_default_business_id())', t,t);
  END LOOP;
END $$;

CREATE POLICY sale_items_business_select ON sale_items FOR SELECT TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_items_business_insert ON sale_items FOR INSERT TO anon,authenticated WITH CHECK (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_items_business_update ON sale_items FOR UPDATE TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id())) WITH CHECK (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_items_business_delete ON sale_items FOR DELETE TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_items.sale_id AND s.business_id=public.get_default_business_id()));

CREATE POLICY customer_payments_business_select ON customer_payments FOR SELECT TO anon,authenticated USING (EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id()));
CREATE POLICY customer_payments_business_insert ON customer_payments FOR INSERT TO anon,authenticated WITH CHECK (EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id()));
CREATE POLICY customer_payments_business_update ON customer_payments FOR UPDATE TO anon,authenticated USING (EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id())) WITH CHECK (EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id()));
CREATE POLICY customer_payments_business_delete ON customer_payments FOR DELETE TO anon,authenticated USING (EXISTS (SELECT 1 FROM customers c WHERE c.id=customer_payments.customer_id AND c.business_id=public.get_default_business_id()));

CREATE POLICY sale_payments_business_select ON sale_payments FOR SELECT TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_payments_business_insert ON sale_payments FOR INSERT TO anon,authenticated WITH CHECK (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_payments_business_update ON sale_payments FOR UPDATE TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id())) WITH CHECK (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_payments_business_delete ON sale_payments FOR DELETE TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_payments.sale_id AND s.business_id=public.get_default_business_id()));

CREATE POLICY stock_movements_business_select ON stock_movements FOR SELECT TO anon,authenticated USING (product_id IS NULL OR EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id()));
CREATE POLICY stock_movements_business_insert ON stock_movements FOR INSERT TO anon,authenticated WITH CHECK (product_id IS NULL OR EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id()));
CREATE POLICY stock_movements_business_update ON stock_movements FOR UPDATE TO anon,authenticated USING (product_id IS NULL OR EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id())) WITH CHECK (product_id IS NULL OR EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id()));
CREATE POLICY stock_movements_business_delete ON stock_movements FOR DELETE TO anon,authenticated USING (product_id IS NULL OR EXISTS (SELECT 1 FROM products p WHERE p.id=stock_movements.product_id AND p.business_id=public.get_default_business_id()));

CREATE POLICY sale_returns_business_select ON sale_returns FOR SELECT TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_returns_business_insert ON sale_returns FOR INSERT TO anon,authenticated WITH CHECK (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_returns_business_update ON sale_returns FOR UPDATE TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id())) WITH CHECK (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id()));
CREATE POLICY sale_returns_business_delete ON sale_returns FOR DELETE TO anon,authenticated USING (EXISTS (SELECT 1 FROM sales s WHERE s.id=sale_returns.sale_id AND s.business_id=public.get_default_business_id()));

NOTIFY pgrst,'reload schema';
