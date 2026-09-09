import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase bağlantısı yapılandırılmamış. VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY tanımlayın.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Business = { id:string; name:string; phone:string|null; address:string|null; active:boolean; created_at:string; updated_at:string };

export type StoreSettings = {
  storeName: string; storeAddress: string; storePhone: string; currency: string; receiptFooter: string; taxRate: string; lowStockDefault: string;
};

export type Category = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  business_id?: string | null;
};

export type Product = {
  id: string;
  name: string;
  barcode: string | null;
  additional_barcodes: string[];
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  category_id: string | null;
  unit: string;
  discount_enabled: boolean;
  discount_price: number | null;
  discount_starts_at: string | null;
  discount_ends_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  business_id?: string | null;
};

export type Sale = {
  id: string;
  total: number;
  payment_method: 'cash' | 'card' | 'credit' | 'split';
  customer_name: string | null;
  customer_id: string | null;
  paid_amount: number;
  created_at: string;
  deleted_at: string | null;
  deleted_reason: string | null;
  settled_at: string | null;
  refunded_at: string | null;
  refund_amount: number | null;
  refund_reason: string | null;
  original_total: number;
  discount_total: number;
  payment_note: string | null;
  staff_id: string | null;
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
  original_unit_price: number;
  discount_amount: number;
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

export type CustomerPayment = {
  id: string;
  customer_id: string;
  amount: number;
  note: string | null;
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

export type SalePayment = { id: string; sale_id: string; method: 'cash'|'card'|'credit'; amount: number; created_at: string };
export type StockMovement = { id:string; product_id:string|null; product_name:string; movement_type:'in'|'out'|'adjustment'|'sale'|'return'|'waste'; quantity:number; before_stock:number; after_stock:number; reason:string|null; sale_id:string|null; staff_id:string|null; created_at:string };
export type Staff = { id:string; name:string; pin:string|null; pin_hash?:string|null; role:'admin'|'manager'|'cashier'; active:boolean; created_at:string };
