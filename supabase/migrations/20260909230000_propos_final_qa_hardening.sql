-- Final QA hardening: safe function search_path + FK indexes.
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

CREATE INDEX IF NOT EXISTS idx_product_price_history_business_id ON public.product_price_history(business_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_product_id ON public.product_price_history(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON public.sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_product_id ON public.sale_returns(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_returns_sale_item_id ON public.sale_returns(sale_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_sale_id ON public.stock_movements(sale_id);

NOTIFY pgrst, 'reload schema';
