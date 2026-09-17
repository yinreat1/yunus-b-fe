/*
# Market POS Sistemi - Veritabanı Şeması

1. Yeni Tablolar
- `categories`: Ürün kategorileri (içecekler, atıştırmalıklar, temel gıda vb.)
  - id (uuid, primary key)
  - name (text, kategori adı)
  - sort_order (int, görüntüleme sırası)
  - created_at (timestamp)

- `products`: Ürün bilgileri
  - id (uuid, primary key)
  - name (text, ürün adı)
  - barcode (text, barkod numarası, unique)
  - price (numeric, satış fiyatı)
  - cost (numeric, alış fiyatı)
  - stock (numeric, stok adedi)
  - min_stock (numeric, minimum stok uyarı seviyesi)
  - category_id (uuid, kategori referansı)
  - unit (text, birim - adet, kg, lt vb.)
  - created_at (timestamp)
  - updated_at (timestamp, otomatik güncellenir)

- `sales`: Satış işlemleri
  - id (uuid, primary key)
  - total (numeric, toplam tutar)
  - payment_method (text: 'cash', 'card', 'credit')
  - customer_name (text, veresiye için müşteri adı)
  - paid_amount (numeric, ödenen tutar)
  - created_at (timestamp)

- `sale_items`: Satış kalemleri
  - id (uuid, primary key)
  - sale_id (uuid, satış referansı)
  - product_id (uuid, ürün referansı)
  - product_name (text, ürün adı)
  - barcode (text, barkod)
  - quantity (numeric, adet)
  - unit_price (numeric, birim fiyat)
  - subtotal (numeric, ara toplam)

2. Güvenlik
- Tüm tablolarda RLS aktif.
- Tek kullanıcı/no-auth uygulama olduğu için anon + authenticated tüm CRUD yetkisine sahip.

3. Önemli Notlar
- updated_at otomatik güncellenir (trigger ile).
- Barkod unique constraint ile benzersiz tutulur.
*/

-- updated_at otomatik güncelleme fonksiyonu
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $body$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$body$
LANGUAGE plpgsql;

-- Kategoriler tablosu
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE
  TO anon, authenticated USING (true);

-- Ürünler tablosu
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  barcode text UNIQUE,
  price numeric(10,2) NOT NULL DEFAULT 0,
  cost numeric(10,2) NOT NULL DEFAULT 0,
  stock numeric(10,3) NOT NULL DEFAULT 0,
  min_stock numeric(10,3) NOT NULL DEFAULT 5,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'adet',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE
  TO anon, authenticated USING (true);

-- Satışlar tablosu
CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  customer_name text,
  paid_amount numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sales" ON sales;
CREATE POLICY "anon_select_sales" ON sales FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sales" ON sales;
CREATE POLICY "anon_insert_sales" ON sales FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sales" ON sales;
CREATE POLICY "anon_update_sales" ON sales FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sales" ON sales;
CREATE POLICY "anon_delete_sales" ON sales FOR DELETE
  TO anon, authenticated USING (true);

-- Satış kalemleri tablosu
CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  barcode text,
  quantity numeric(10,3) NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  subtotal numeric(10,2) NOT NULL DEFAULT 0
);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_sale_items" ON sale_items;
CREATE POLICY "anon_select_sale_items" ON sale_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_sale_items" ON sale_items;
CREATE POLICY "anon_insert_sale_items" ON sale_items FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_sale_items" ON sale_items;
CREATE POLICY "anon_update_sale_items" ON sale_items FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_sale_items" ON sale_items;
CREATE POLICY "anon_delete_sale_items" ON sale_items FOR DELETE
  TO anon, authenticated USING (true);

-- Index'ler
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);

-- updated_at otomatik güncelleme trigger'ı
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
