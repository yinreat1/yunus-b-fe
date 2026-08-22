import { useState, useMemo, useEffect } from 'react';
import { TrendingUp, ShoppingBag, Banknote, CreditCard, BookOpen, Package, AlertTriangle, Calendar, ChevronRight, Trash2, RotateCcw, Trash } from 'lucide-react';
import { useSales, useProducts, getSaleItems, moveSaleToTrash, useDeletedSales, restoreSaleFromTrash, permanentlyDeleteSale } from '@/lib/hooks';
import { formatCurrency, formatDateTime, PAYMENT_METHODS } from '@/lib/utils';
import type { Sale, SaleItem } from '@/lib/supabase';

export default function ReportsPage() {
  const { sales, loading, reload: reloadSales } = useSales(200);
  const { sales: deletedSales, loading: trashLoading, reload: reloadTrash } = useDeletedSales(200);
  const { products } = useProducts();
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowTrash(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50"
            >
              <Trash2 size={17} />
              Çöp Kutusu
              {deletedSales.length > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-600">{deletedSales.length}</span>
              )}
            </button>
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
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title="Çöp kutusuna taşı"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!window.confirm('Bu satışı çöp kutusuna taşımak istiyor musun? Satış raporlardan çıkarılacak ve stok geri alınacak.')) return;
                              setActionLoading(true);
                              const ok = await moveSaleToTrash(sale.id);
                              setActionLoading(false);
                              if (ok) {
                                setSelectedSale(null);
                                await reloadSales();
                                await reloadTrash();
                              } else {
                                alert('Satış taşınamadı.');
                              }
                            }}
                            disabled={actionLoading}
                            className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                          </button>
                          <ChevronRight size={16} className="text-slate-400" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onTrash={async () => {
            setActionLoading(true);
            const ok = await moveSaleToTrash(selectedSale.id);
            setActionLoading(false);
            if (ok) {
              setSelectedSale(null);
              await reloadSales();
              await reloadTrash();
            } else {
              alert('Satış çöp kutusuna taşınamadı.');
            }
          }}
          actionLoading={actionLoading}
        />
      )}
      {showTrash && (
        <TrashModal
          sales={deletedSales}
          loading={trashLoading}
          onClose={() => setShowTrash(false)}
          onRestore={async (id) => {
            setActionLoading(true);
            const ok = await restoreSaleFromTrash(id);
            setActionLoading(false);
            if (ok) {
              await reloadSales();
              await reloadTrash();
            } else {
              alert('Satış geri yüklenemedi.');
            }
          }}
          onPermanentDelete={async (id) => {
            if (!window.confirm('Bu satış çöp kutusundan KALICI olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?')) return;
            setActionLoading(true);
            const ok = await permanentlyDeleteSale(id);
            setActionLoading(false);
            if (ok) await reloadTrash();
            else alert('Satış kalıcı olarak silinemedi.');
          }}
          actionLoading={actionLoading}
        />
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

function TrashModal({
  sales,
  loading,
  onClose,
  onRestore,
  onPermanentDelete,
  actionLoading,
}: {
  sales: Sale[];
  loading: boolean;
  onClose: () => void;
  onRestore: (id: string) => Promise<void>;
  onPermanentDelete: (id: string) => Promise<void>;
  actionLoading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-3xl max-h-[80vh] overflow-hidden animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Trash2 size={19} /> Çöp Kutusu</h2>
            <p className="text-xs text-slate-500 mt-1">Yanlışlıkla alınan satışları buradan geri yükleyebilir veya kalıcı olarak silebilirsin.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="p-10 text-center text-slate-400">Çöp kutusu yükleniyor...</div>
          ) : sales.length === 0 ? (
            <div className="p-10 text-center">
              <Trash2 className="mx-auto mb-3 text-slate-300" size={38} />
              <p className="font-medium text-slate-500">Çöp kutusu boş</p>
              <p className="mt-1 text-xs text-slate-400">İptal edilen satışlar burada görünecek.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sales.map((sale) => (
                <div key={sale.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{formatDateTime(sale.created_at)}</span>
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-600">İptal</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {PAYMENT_METHODS[sale.payment_method].label} · {sale.customer_name || 'Müşteri yok'} · {formatCurrency(Number(sale.total))}
                    </p>
                    {sale.deleted_reason && <p className="mt-1 text-xs text-slate-400">{sale.deleted_reason}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => onRestore(sale.id)}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 rounded-md bg-teal-50 px-3 py-2 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                    >
                      <RotateCcw size={14} /> Geri Yükle
                    </button>
                    <button
                      onClick={() => onPermanentDelete(sale.id)}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                    >
                      <Trash size={14} /> Kalıcı Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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

function SaleDetailModal({
  sale,
  onClose,
  onTrash,
  actionLoading,
}: {
  sale: Sale;
  onClose: () => void;
  onTrash: () => Promise<void>;
  actionLoading: boolean;
}) {
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
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                if (window.confirm('Bu satışı çöp kutusuna taşımak istiyor musun? Satış raporlardan çıkarılacak ve stok geri alınacak.')) {
                  await onTrash();
                }
              }}
              disabled={actionLoading}
              className="flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={14} /> İade / Çöpe Taşı
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>
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
