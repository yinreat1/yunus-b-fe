import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nmwswdjqqcunpupdrbwi.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5td3N3ZGpxcWN1bnB1cGRyYndpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NDg1NDUsImV4cCI6MjEwMjMyNDU0NX0.-6LLtBO_9S5rGMEWVg-kJFIhSVDzNnMJB274tqmIDzI';

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
  deleted_at: string | null;
};

export type Sale = {
  id: string;
  total: number;
  payment_method: 'cash' | 'card' | 'credit';
  customer_name: string | null;
  customer_id: string | null;
  paid_amount: number;
  created_at: string;
  deleted_at: string | null;
  deleted_reason: string | null;
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
