import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, ShoppingCart, Trash2, Plus, Minus, X, CreditCard, Banknote, BookOpen, Printer, Receipt } from 'lucide-react';
import { useProducts, useCategories, useCustomers, completeSale, type CartItem } from '@/lib/hooks';
import { formatCurrency, PAYMENT_METHODS, type PaymentMethod } from '@/lib/utils';
import type { Product, SaleWithItems } from '@/lib/supabase';

type Props = {
  onNavigate: (page: string) => void;
};

export default function POSPage({ onNavigate }: Props) {
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  const { customers } = useCustomers();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [lastSale, setLastSale] = useState<SaleWithItems | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (activeCategory) {
      result = result.filter((p) => p.category_id === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (p) => p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q))
      );
    }
    return result;
  }, [products, activeCategory, search]);

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          return prev;
        }
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      if (product.stock <= 0) return prev;
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product.id !== productId) return i;
          const newQty = i.quantity + delta;
          if (newQty > i.product.stock) return i;
          return { ...i, quantity: newQty };
        })
        .filter((i) => i.quantity > 0)
    );
  }

  function removeFromCart(productId: string) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  function clearCart() {
    setCart([]);
  }

  function handleBarcodeScan(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && search.trim()) {
      const match = products.find((p) => p.barcode === search.trim());
      if (match) {
        addToCart(match);
        setSearch('');
      }
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Products Section */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Search Bar */}
        <div className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              ref={searchRef}
              type="text"
              className="input pl-10 text-lg"
              placeholder="Ürün ara veya barkod tara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleBarcodeScan}
            />
          </div>
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2">
          <button
            className={`btn px-4 py-2 text-sm whitespace-nowrap ${
              activeCategory === null ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
            onClick={() => setActiveCategory(null)}
          >
            Tümü
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`btn px-4 py-2 text-sm whitespace-nowrap ${
                activeCategory === cat.id ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Product Grid */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-4">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-slate-400">Ürünler yükleniyor...</div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
              <Search size={48} />
              <p>Ürün bulunamadı</p>
              <button className="btn-secondary text-sm" onClick={() => onNavigate('products')}>
                Ürün eklemek için tıklayın
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="card group flex flex-col p-3 text-left transition-all hover:border-teal-400 hover:shadow-md active:scale-95"
                >
                  <div className="mb-2 flex items-start justify-between gap-1">
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-700">
                      {product.name}
                    </h3>
                  </div>
                  <div className="mt-auto">
                    <p className="text-lg font-bold text-teal-700">
                      {formatCurrency(product.price)}
                    </p>
                    <p className={`text-xs ${product.stock <= product.min_stock ? 'text-red-500 font-medium' : 'text-slate-400'}`}>
                      Stok: {product.stock} {product.unit}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart Section */}
      <div className="flex w-96 flex-col border-l border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="text-teal-600" size={22} />
            <h2 className="text-lg font-bold text-slate-800">Sepet</h2>
            {cartCount > 0 && (
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-bold text-teal-700">
                {cartCount}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button onClick={clearCart} className="text-sm text-red-500 hover:text-red-600">
              Temizle
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-300">
              <ShoppingCart size={48} />
              <p className="text-sm">Sepet boş</p>
              <p className="text-xs">Ürün seçerek başlayın</p>
            </div>
          ) : (
            <div className="space-y-2">
              {cart.map((item) => (
                <div
                  key={item.product.id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 animate-fade-in"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {item.product.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(item.product.price)} x {item.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => updateQuantity(item.product.id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <p className="w-20 text-right text-sm font-bold text-teal-700">
                    {formatCurrency(item.product.price * item.quantity)}
                  </p>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="text-slate-300 hover:text-red-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cart Total */}
        <div className="border-t border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-slate-500">Toplam</span>
            <span className="text-2xl font-bold text-slate-800">
              {formatCurrency(cartTotal)}
            </span>
          </div>
          <button
            disabled={cart.length === 0}
            onClick={() => setShowPayment(true)}
            className="btn-success w-full py-3 text-lg"
          >
            <CreditCard size={22} />
            Ödemeye Geç
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          total={cartTotal}
          customers={customers}
          onClose={() => setShowPayment(false)}
          onComplete={async (method, paid, customerName, customerId) => {
            const sale = await completeSale(cart, method, paid, customerName, customerId);
            if (sale) {
              setLastSale(sale);
              setShowReceipt(true);
              setCart([]);
              setShowPayment(false);
            }
          }}
        />
      )}

      {/* Receipt Modal */}
      {showReceipt && lastSale && (
        <ReceiptModal
          sale={lastSale}
          onClose={() => {
            setShowReceipt(false);
            setLastSale(null);
          }}
          onNewSale={() => {
            setShowReceipt(false);
            setLastSale(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

function PaymentModal({
  total,
  customers,
  onClose,
  onComplete,
}: {
  total: number;
  customers: { id: string; name: string; balance: number }[];
  onClose: () => void;
  onComplete: (method: PaymentMethod, paid: number, customerName?: string, customerId?: string) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAmount, setPaidAmount] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [error, setError] = useState('');

  const paid = parseFloat(paidAmount) || 0;
  const change = method === 'cash' ? paid - total : 0;

  function handleSubmit() {
    if (method === 'cash' && paid < total) {
      setError('Ödenen tutar yetersiz');
      return;
    }
    if (method === 'credit') {
      if (selectedCustomerId) {
        const cust = customers.find((c) => c.id === selectedCustomerId);
        onComplete(method, total, cust?.name, selectedCustomerId);
        return;
      }
      if (!customerName.trim()) {
        setError('Müşteri seçin veya ad girin');
        return;
      }
      onComplete(method, total, customerName.trim());
      return;
    }
    onComplete(method, method === 'cash' ? paid : total);
  }

  function quickAmount(val: number) {
    setPaidAmount(val.toFixed(2));
    setError('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="card w-full max-w-md p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Ödeme</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={22} />
          </button>
        </div>

        <div className="mb-6 rounded-lg bg-teal-50 p-4 text-center">
          <p className="text-sm text-teal-600">Ödenecek Tutar</p>
          <p className="text-3xl font-bold text-teal-700">{formatCurrency(total)}</p>
        </div>

        {/* Payment Methods */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {(['cash', 'card', 'credit'] as PaymentMethod[]).map((key) => {
            const val = PAYMENT_METHODS[key];
            const Icon = key === 'cash' ? Banknote : key === 'card' ? CreditCard : BookOpen;
            const activeClasses = {
              cash: 'border-emerald-500 bg-emerald-50 text-emerald-700',
              card: 'border-blue-500 bg-blue-50 text-blue-700',
              credit: 'border-amber-500 bg-amber-50 text-amber-700',
            }[key];
            return (
              <button
                key={key}
                onClick={() => { setMethod(key); setError(''); }}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition-all ${
                  method === key ? activeClasses : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                }`}
              >
                <Icon size={24} />
                <span className="text-sm font-medium">{val.label}</span>
              </button>
            );
          })}
        </div>

        {/* Cash Payment */}
        {method === 'cash' && (
          <div className="mb-4">
            <label className="label">Alınan Para</label>
            <input
              type="number"
              className="input text-lg"
              placeholder="0.00"
              value={paidAmount}
              onChange={(e) => { setPaidAmount(e.target.value); setError(''); }}
              autoFocus
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {[total, Math.ceil(total / 50) * 50, Math.ceil(total / 100) * 100, Math.ceil(total / 200) * 200].map((val, i) => (
                <button
                  key={i}
                  onClick={() => quickAmount(val)}
                  className="btn-secondary px-3 py-1.5 text-sm"
                >
                  {formatCurrency(val)}
                </button>
              ))}
            </div>
            {paid >= total && (
              <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-center">
                <p className="text-sm text-emerald-600">Para Üstü</p>
                <p className="text-xl font-bold text-emerald-700">{formatCurrency(change)}</p>
              </div>
            )}
          </div>
        )}

        {/* Credit Payment */}
        {method === 'credit' && (
          <div className="mb-4">
            {customers.length > 0 && (
              <div className="mb-3">
                <label className="label">Müşteri Seç</label>
                <select
                  className="input"
                  value={selectedCustomerId}
                  onChange={(e) => { setSelectedCustomerId(e.target.value); setCustomerName(''); setError(''); }}
                >
                  <option value="">— Kayıtlı müşteri seç —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.balance > 0 ? `(Borç: ${formatCurrency(c.balance)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!selectedCustomerId && (
              <div>
                <label className="label">Müşteri Adı</label>
                <input
                  type="text"
                  className="input text-lg"
                  placeholder="Müşteri adı girin..."
                  value={customerName}
                  onChange={(e) => { setCustomerName(e.target.value); setError(''); }}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

        <button onClick={handleSubmit} className="btn-success w-full py-3 text-lg">
          Satışı Tamamla
        </button>
      </div>
    </div>
  );
}

function ReceiptModal({
  sale,
  onClose,
  onNewSale,
}: {
  sale: SaleWithItems;
  onClose: () => void;
  onNewSale: () => void;
}) {
  const methodLabel = PAYMENT_METHODS[sale.payment_method].label;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        className="card w-full max-w-sm p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <Receipt className="text-emerald-600" size={24} />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Satış Tamamlandı</h2>
        </div>

        <div className="mb-4 rounded-lg border border-dashed border-slate-300 p-4 font-mono text-sm">
          <div className="mb-2 flex justify-between border-b border-slate-200 pb-2">
            <span className="font-bold">FİŞ</span>
            <span className="text-slate-500">{new Date(sale.created_at).toLocaleTimeString('tr-TR')}</span>
          </div>
          {sale.sale_items.map((item, i) => (
            <div key={i} className="mb-1 flex justify-between">
              <span className="truncate">{item.quantity}x {item.product_name}</span>
              <span>{formatCurrency(item.subtotal)}</span>
            </div>
          ))}
          <div className="mt-2 border-t border-slate-200 pt-2">
            <div className="flex justify-between font-bold">
              <span>TOPLAM</span>
              <span>{formatCurrency(sale.total)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>{methodLabel}</span>
              {sale.payment_method === 'cash' && <span>Üst: {formatCurrency(sale.paid_amount - sale.total)}</span>}
            </div>
            {sale.customer_name && (
              <div className="flex justify-between text-slate-500">
                <span>Müşteri</span>
                <span>{sale.customer_name}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={handlePrint} className="btn-secondary flex-1 py-2.5">
            <Printer size={18} />
            Yazdır
          </button>
          <button onClick={onNewSale} className="btn-primary flex-1 py-2.5">
            Yeni Satış
          </button>
        </div>
      </div>
    </div>
  );
}
