import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  barcode: string | null;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  category_id: string | null;
  unit: string;
  created_at: string;
  updated_at: string;
};

export type Sale = {
  id: string;
  total: number;
  payment_method: 'cash' | 'card' | 'credit';
  customer_name: string | null;
  customer_id: string | null;
  paid_amount: number;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  barcode: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type SaleWithItems = Sale & {
  sale_items: SaleItem[];
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  created_at: string;
};

export type CashSession = {
  id: string;
  opening_amount: number;
  closing_amount: number | null;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  note: string | null;
};
