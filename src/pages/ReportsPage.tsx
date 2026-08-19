import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, ShoppingBag, Banknote, CreditCard, BookOpen, Package, AlertTriangle, Calendar, ChevronRight } from 'lucide-react';
import { useSales, useProducts, getSaleItems } from '@/lib/hooks';
import { formatCurrency, formatDateTime, PAYMENT_METHODS } from '@/lib/utils';
import type { Sale, SaleItem } from '@/lib/supabase';

export default function ReportsPage() {
  const { sales, loading } = useSales(200);
  const { products } = useProducts();
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const filteredSales = useMemo(() => {
    if (dateRange === 'all') return sales;
    const now = new Date();
    const start = new Date(now);
    if (dateRange === 'today') start.setHours(0, 0, 0, 0);
    else if (dateRange === 'week') start.setDate(now.getDate() - 7);
    else if (dateRange === 'month') start.setMonth(now.getMonth() - 1);
    return sales.filter((s) => new Date(s.created_at) >= start);
  }, [sales, dateRange]);

  const stats = useMemo(() => {
    const total = filteredSales.reduce((sum, s) => sum + parseFloat(s.total.toString()), 0);
    const cashTotal = filteredSales.filter((s) => s.payment_method === 'cash').reduce((sum, s) => sum + parseFloat(s.total.toString()), 0);
    const cardTotal = filteredSales.filter((s) => s.payment_method === 'card').reduce((sum, s) => sum + parseFloat(s.total.toString()), 0);
    const creditTotal = filteredSales.filter((s) => s.payment_method === 'credit').reduce((sum, s) => sum + parseFloat(s.total.toString()), 0);
    const count = filteredSales.length;
    const avg = count > 0 ? total / count : 0;
    return { total, cashTotal, cardTotal, creditTotal, count, avg };
  }, [filteredSales]);

  const lowStockProducts = products.filter((p) => p.stock <= p.min_stock);

  const dateRanges = [
    { key: 'today', label: 'Bugün' },
    { key: 'week', label: 'Son 7 Gün' },
    { key: 'month', label: 'Son 30 Gün' },
    { key: 'all', label: 'Tümü' },
  ] as const;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Raporlar</h1>
            <p className="text-sm text-slate-500">Satış özeti ve istatistikler</p>
          </div>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {dateRanges.map((range) => (
              <button
                key={range.key}
                onClick={() => setDateRange(range.key)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  dateRange === range.key ? 'bg-white text-teal-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats Cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<TrendingUp className="text-teal-600" size={22} />}
            label="Toplam Ciro"
            value={formatCurrency(stats.total)}
            color="teal"
          />
          <StatCard
            icon={<ShoppingBag className="text-blue-600" size={22} />}
            label="Satış Adedi"
            value={stats.count.toString()}
            color="blue"
          />
          <StatCard
            icon={<Calendar className="text-amber-600" size={22} />}
            label="Ort. Satış Tutarı"
            value={formatCurrency(stats.avg)}
            color="amber"
          />
          <StatCard
            icon={<Package className="text-purple-600" size={22} />}
            label="Ürün Çeşidi"
            value={products.length.toString()}
            color="purple"
          />
        </div>

        {/* Payment Breakdown */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <PaymentCard icon={<Banknote className="text-emerald-600" size={20} />} label="Nakit" value={formatCurrency(stats.cashTotal)} bgColor="bg-emerald-50" textColor="text-emerald-700" />
          <PaymentCard icon={<CreditCard className="text-blue-600" size={20} />} label="Kart" value={formatCurrency(stats.cardTotal)} bgColor="bg-blue-50" textColor="text-blue-700" />
          <PaymentCard icon={<BookOpen className="text-amber-600" size={20} />} label="Veresiye" value={formatCurrency(stats.creditTotal)} bgColor="bg-amber-50" textColor="text-amber-700" />
        </div>

        {/* Low Stock Alert */}
        {lowStockProducts.length > 0 && (
          <div className="mb-6 card border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="text-amber-600" size={20} />
              <h3 className="font-semibold text-amber-800">Kritik Stok Uyarısı ({lowStockProducts.length})</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockProducts.map((p) => (
                <span key={p.id} className="rounded-md bg-white px-3 py-1 text-sm text-amber-700 border border-amber-200">
                  {p.name} — {p.stock} {p.unit}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent Sales */}
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-4 py-3">
            <h3 className="font-semibold text-slate-800">Son Satışlar</h3>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Yükleniyor...</div>
          ) : filteredSales.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Bu dönemde satış yok</div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Tarih</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Ödeme</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Müşteri</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600">Tutar</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.slice(0, 50).map((sale) => {
                  const method = PAYMENT_METHODS[sale.payment_method];
                  const badgeClasses = {
                    cash: 'bg-emerald-100 text-emerald-700',
                    card: 'bg-blue-100 text-blue-700',
                    credit: 'bg-amber-100 text-amber-700',
                  }[sale.payment_method];
                  return (
                    <tr key={sale.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedSale(sale)}>
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDateTime(sale.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeClasses}`}>
                          {method.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{sale.customer_name || '-'}</td>
                      <td className="px-4 py-3 text-right font-semibold text-teal-700">{formatCurrency(parseFloat(sale.total.toString()))}</td>
                      <td className="px-4 py-3 text-slate-400"><ChevronRight size={16} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedSale && (
        <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}
    </div>
  );
}

const statColors: Record<string, string> = {
  teal: 'bg-teal-50',
  blue: 'bg-blue-50',
  amber: 'bg-amber-50',
  purple: 'bg-purple-50',
};

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="card p-5">
      <div className={`mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg ${statColors[color] || 'bg-slate-50'}`}>
        {icon}
      </div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
    </div>
  );
}

function PaymentCard({ icon, label, value, bgColor, textColor }: { icon: React.ReactNode; label: string; value: string; bgColor: string; textColor: string }) {
  return (
    <div className={`card p-4 ${bgColor} border-0`}>
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <p className="text-sm text-slate-600">{label}</p>
          <p className={`text-xl font-bold ${textColor}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function SaleDetailModal({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const [items, setItems] = useState<SaleItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSaleItems(sale.id).then((data) => {
      setItems(data);
      setLoading(false);
    });
  }, [sale.id]);

  const method = PAYMENT_METHODS[sale.payment_method];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Satış Detayı</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="mb-4 flex justify-between text-sm text-slate-500">
          <span>{formatDateTime(sale.created_at)}</span>
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
            sale.payment_method === 'cash' ? 'bg-emerald-100 text-emerald-700' :
            sale.payment_method === 'card' ? 'bg-blue-100 text-blue-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {method.label}
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400">Yükleniyor...</div>
        ) : (
          <div className="space-y-2 border-t border-slate-200 pt-3">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-slate-600">{item.quantity}x {item.product_name}</span>
                <span className="font-medium text-slate-700">{formatCurrency(parseFloat(item.subtotal.toString()))}</span>
              </div>
            ))}
            <div className="border-t border-slate-200 pt-2 flex justify-between font-bold">
              <span>Toplam</span>
              <span className="text-teal-700">{formatCurrency(parseFloat(sale.total.toString()))}</span>
            </div>
            {sale.customer_name && (
              <div className="flex justify-between text-sm text-slate-500">
                <span>Müşteri</span>
                <span>{sale.customer_name}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
