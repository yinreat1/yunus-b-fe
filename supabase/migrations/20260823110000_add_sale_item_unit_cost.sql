-- Satış anındaki alış maliyetini sakla. Mevcut verileri silmez/değiştirmez.
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric(10,2);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
