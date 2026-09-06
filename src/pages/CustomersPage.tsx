import { useMemo, useState } from 'react';
import { Users, Plus, Search, Phone, Trash2, Edit, X, Wallet, TrendingUp, UserCheck, Clock, ReceiptText, CreditCard, MessageCircle } from 'lucide-react';
import { useCustomers, useCustomerDebtHistory, addCustomer, updateCustomer, deleteCustomer, payCustomerDebt } from '@/lib/hooks';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Customer } from '@/lib/supabase';

export default function CustomersPage() {
  const { customers, loading, reload } = useCustomers();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.phone || '').includes(search));
  }, [customers, search]);

  const totalDebt = customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance || 0)), 0);
  const debtorsCount = customers.filter((c) => Number(c.balance || 0) > 0).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Müşteriler & Cari</h1>
            <p className="text-sm text-slate-500">Veresiye satışları, alınan ödemeler ve kalan borç</p>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary px-4 py-2"><Plus size={18} /> Yeni Müşteri</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="card p-5"><div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50"><Users className="text-teal-600" size={22} /></div><p className="text-sm text-slate-500">Toplam Müşteri</p><p className="text-2xl font-bold text-slate-800">{customers.length}</p></div>
          <div className="card p-5"><div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50"><TrendingUp className="text-amber-600" size={22} /></div><p className="text-sm text-slate-500">Toplam Veresiye Borç</p><p className="text-2xl font-bold text-amber-700">{formatCurrency(totalDebt)}</p></div>
          <div className="card p-5"><div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50"><UserCheck className="text-blue-600" size={22} /></div><p className="text-sm text-slate-500">Borçlu Müşteri</p><p className="text-2xl font-bold text-slate-800">{debtorsCount}</p></div>
        </div>

        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="input pl-10" placeholder="Müşteri ara (ad veya telefon)..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {loading ? <div className="py-12 text-center text-slate-400">Yükleniyor...</div> : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400"><Users size={48} /><p>Müşteri bulunamadı</p><button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-secondary text-sm">Yeni müşteri ekle</button></div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Müşteri</th><th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Telefon</th><th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Bakiye</th><th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Kayıt Tarihi</th><th className="px-4 py-3"></th></tr></thead>
              <tbody>{filtered.map((customer) => (
                <tr key={customer.id} className="cursor-pointer border-b border-slate-100 hover:bg-slate-50" onClick={() => setDetailCustomer(customer)}>
                  <td className="px-4 py-3"><p className="font-semibold text-slate-800">{customer.name}</p></td>
                  <td className="px-4 py-3 text-sm text-slate-600">{customer.phone ? <span className="flex items-center gap-1"><Phone size={14} className="text-slate-400" />{customer.phone}</span> : <span className="text-slate-300">-</span>}</td>
                  <td className="px-4 py-3 text-right"><span className={`font-bold ${customer.balance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatCurrency(customer.balance)}</span></td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatDateTime(customer.created_at)}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-end gap-3"><button onClick={() => { setEditing(customer); setShowForm(true); }} className="text-slate-400 hover:text-blue-500"><Edit size={16} /></button><button onClick={async () => { if (confirm(`${customer.name} silinsin mi?`)) { await deleteCustomer(customer.id); reload(); } }} className="text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <CustomerForm customer={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); reload(); }} />}
      {detailCustomer && <CustomerDetail customer={detailCustomer} onClose={() => setDetailCustomer(null)} onChanged={reload} />}
    </div>
  );
}

function CustomerForm({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Müşteri adı gerekli.'); return; }
    setSaving(true);
    const ok = customer ? await updateCustomer(customer.id, name, phone) : Boolean(await addCustomer(name, phone));
    setSaving(false);
    if (!ok) { setError('Kayıt sırasında hata oluştu.'); return; }
    onSaved();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}><div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-800">{customer ? 'Müşteri Düzenle' : 'Yeni Müşteri'}</h2><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button></div><form onSubmit={handleSubmit} className="space-y-4"><div><label className="label">Müşteri Adı *</label><input className="input text-base" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div><div><label className="label">Telefon</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0xxx xxx xx xx" /></div>{error && <p className="text-sm text-red-500">{error}</p>}<button type="submit" disabled={saving} className="btn-primary w-full py-3">{saving ? 'Kaydediliyor...' : customer ? 'Güncelle' : 'Müşteri Ekle'}</button></form></div></div>;
}

function shareCustomerDebtWhatsApp(customer: Customer, sales: any[], payments: any[], balance: number) {
  const lines = [
    `*${customer.name} Borç Özeti*`, '',
    ...(sales.length ? sales.flatMap((sale: any) => [
      `📅 ${formatDateTime(sale.created_at)}`,
      ...(sale.sale_items || []).map((item: any) => `• ${item.quantity} × ${item.product_name || 'Ürün'} — ${formatCurrency(item.subtotal)}`),
      `Satış toplamı: ${formatCurrency(sale.total)}`, ''
    ]) : ['Henüz veresiye alışveriş kaydı yok.', '']),
    payments.length ? '*Ödemeler*' : '',
    ...payments.map((p: any) => `✅ ${formatDateTime(p.created_at)} — ${formatCurrency(p.amount)}${p.note ? ` (${p.note})` : ''}`),
    '', `*Kalan Borç: ${formatCurrency(balance)}*`, '', 'Pro POS'
  ].filter(Boolean);
  const text = encodeURIComponent(lines.join('\n'));
  const digits = (customer.phone || '').replace(/\D/g, '');
  const phone = digits
    ? (digits.startsWith('0') ? `90${digits.slice(1)}` : digits.startsWith('90') ? digits : `90${digits}`)
    : '';
  const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  const popup = window.open(url, '_blank', 'noopener,noreferrer');
  if (!popup) {
    window.location.href = url;
  }
}

function CustomerDetail({ customer, onClose, onChanged }: { customer: Customer; onClose: () => void; onChanged: () => void }) {
  const { sales, payments, currentBalance: liveBalance, loading, reload } = useCustomerDebtHistory(customer.id);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payMode, setPayMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentBalance = Math.max(0, Number(liveBalance ?? customer.balance ?? 0));
  const totalPurchases = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalPayments = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  async function handlePayment() {
    const amount = Math.min(Number(payAmount) || 0, currentBalance);
    if (amount <= 0) return;
    setSaving(true);
    const result = await payCustomerDebt(customer.id, amount, payNote);
    setSaving(false);
    if (!result.success) return;
    setPayAmount(''); setPayNote(''); setPayMode(false);
    await reload(); onChanged();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
    <div className="card flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4"><div><h2 className="text-xl font-bold text-slate-800">{customer.name}</h2>{customer.phone && <p className="text-sm text-slate-500">{customer.phone}</p>}</div><div className="flex items-center gap-2"><button onClick={() => shareCustomerDebtWhatsApp(customer, sales, payments, currentBalance)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"><MessageCircle size={16}/> WhatsApp Borç Özeti</button><button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button></div></div>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
        <Stat label="Kalan borç" value={formatCurrency(currentBalance)} accent="amber" />
        <Stat label="Toplam veresiye" value={formatCurrency(totalPurchases)} accent="slate" />
        <Stat label="Toplam ödeme" value={formatCurrency(totalPayments)} accent="emerald" />
        <button disabled={currentBalance <= 0} onClick={() => { setPayAmount(currentBalance.toFixed(2)); setPayMode(true); }} className="btn-success min-h-[76px] flex-col py-2 disabled:opacity-40"><Wallet size={20} /> {currentBalance > 0 ? 'Borç Öde' : 'Borç Yok'}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {payMode && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><div className="mb-3 flex items-center gap-2 font-semibold text-emerald-800"><CreditCard size={18} /> Borç Ödeme Kaydı</div><div className="grid gap-3 sm:grid-cols-2"><div><label className="label">Ödeme tutarı</label><input type="number" min="0.01" max={currentBalance} step="0.01" className="input text-lg" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} autoFocus /></div><div><label className="label">Not (opsiyonel)</label><input className="input" placeholder="Nakit ödeme, kapatma vb." value={payNote} onChange={(e) => setPayNote(e.target.value)} /></div></div><div className="mt-3 flex gap-2"><button onClick={handlePayment} disabled={saving || Number(payAmount) <= 0} className="btn-success px-4 py-2">{saving ? 'Kaydediliyor...' : 'Ödemeyi Kaydet'}</button><button onClick={() => setPayMode(false)} className="btn-secondary px-4 py-2">İptal</button></div></div>}

        <div className="mb-6"><div className="mb-3 flex items-center gap-2"><ReceiptText size={18} className="text-amber-600" /><h3 className="font-bold text-slate-800">Veresiye Alışverişleri</h3></div>{loading ? <p className="py-8 text-center text-slate-400">Geçmiş yükleniyor...</p> : sales.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">Bu müşteriye ait veresiye satış kaydı yok.</div> : <div className="space-y-3">{sales.map((sale) => <SaleHistoryCard key={sale.id} sale={sale} />)}</div>}</div>

        <div><div className="mb-3 flex items-center gap-2"><Wallet size={18} className="text-emerald-600" /><h3 className="font-bold text-slate-800">Borç Ödeme Geçmişi</h3></div>{payments.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">Henüz ödeme kaydı yok.</div> : <div className="overflow-hidden rounded-xl border border-slate-200"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="px-3 py-2 text-left">Tarih / Saat</th><th className="px-3 py-2 text-left">Not</th><th className="px-3 py-2 text-right">Ödeme</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-slate-100"><td className="px-3 py-2 text-slate-600"><span className="flex items-center gap-1"><Clock size={14} />{formatDateTime(payment.created_at)}</span></td><td className="px-3 py-2 text-slate-500">{payment.note || '-'}</td><td className="px-3 py-2 text-right font-bold text-emerald-600">-{formatCurrency(payment.amount)}</td></tr>)}</tbody></table></div>}</div>
      </div>

      <div className="border-t-2 border-slate-300 bg-white px-5 py-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-sm text-slate-500">Hesap özeti</div><div className="flex flex-wrap items-end gap-6"><div><p className="text-xs text-slate-400">Toplam alışveriş</p><p className="font-semibold text-slate-700">{formatCurrency(totalPurchases)}</p></div><div><p className="text-xs text-slate-400">Toplam ödeme</p><p className="font-semibold text-emerald-600">{formatCurrency(totalPayments)}</p></div><div className="text-right"><p className="text-xs text-amber-600">KALAN BORÇ</p><p className="text-2xl font-black text-amber-700">{formatCurrency(currentBalance)}</p></div></div></div></div>
    </div>
  </div>;
}

function SaleHistoryCard({ sale }: { sale: any }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div><p className="flex items-center gap-2 font-semibold text-slate-800"><Clock size={15} className="text-slate-400" /> {formatDateTime(sale.created_at)}</p><p className="mt-1 text-xs text-slate-400">Veresiye satış</p></div><div className="text-right"><p className="text-xs text-slate-400">Satış toplamı</p><p className="text-lg font-black text-amber-700">{formatCurrency(sale.total)}</p></div></div><div className="divide-y divide-slate-100 rounded-lg bg-slate-50">{(sale.sale_items || []).map((item: any) => <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-medium text-slate-700">{item.quantity} × {item.product_name}</p>{item.barcode && <p className="font-mono text-[11px] text-slate-400">{item.barcode}</p>}</div><span className="shrink-0 font-semibold text-slate-700">{formatCurrency(item.subtotal)}</span></div>)}</div></div>;
}

function Stat({ label, value, accent }: { label: string; value: string; accent: 'amber' | 'emerald' | 'slate' }) {
  const tone = accent === 'amber' ? 'text-amber-700' : accent === 'emerald' ? 'text-emerald-700' : 'text-slate-800';
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 text-xl font-black ${tone}`}>{value}</p></div>;
}
