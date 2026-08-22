import { useState } from 'react';
import { Users, Plus, Search, Phone, Trash2, Edit, X, Wallet, TrendingUp, UserCheck } from 'lucide-react';
import {
  useCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  payCustomerDebt,
} from '@/lib/hooks';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import type { Customer } from '@/lib/supabase';

export default function CustomersPage() {
  const { customers, loading, reload } = useCustomers();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<Customer | null>(null);

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone && c.phone.includes(search))
  );

  const totalDebt = customers.reduce((sum, c) => sum + (c.balance > 0 ? c.balance : 0), 0);
  const debtorsCount = customers.filter((c) => c.balance > 0).length;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Müşteriler & Cari</h1>
            <p className="text-sm text-slate-500">Veresiye müşterileri ve borç takibi</p>
          </div>
          <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary px-4 py-2">
            <Plus size={18} />
            Yeni Müşteri
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-teal-50">
              <Users className="text-teal-600" size={22} />
            </div>
            <p className="text-sm text-slate-500">Toplam Müşteri</p>
            <p className="text-2xl font-bold text-slate-800">{customers.length}</p>
          </div>
          <div className="card p-5">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50">
              <TrendingUp className="text-amber-600" size={22} />
            </div>
            <p className="text-sm text-slate-500">Toplam Veresiye Borç</p>
            <p className="text-2xl font-bold text-amber-700">{formatCurrency(totalDebt)}</p>
          </div>
          <div className="card p-5">
            <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50">
              <UserCheck className="text-blue-600" size={22} />
            </div>
            <p className="text-sm text-slate-500">Borçlu Müşteri</p>
            <p className="text-2xl font-bold text-slate-800">{debtorsCount}</p>
          </div>
        </div>

        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              className="input pl-10"
              placeholder="Müşteri ara (ad veya telefon)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Customer List */}
        {loading ? (
          <div className="py-12 text-center text-slate-400">Yükleniyor...</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-400">
            <Users size={48} />
            <p className="text-sm">Müşteri bulunamadı</p>
            <button onClick={() => { setEditing(null); setShowForm(true); }} className="btn-secondary text-sm">
              Yeni müşteri ekle
            </button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Müşteri</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Telefon</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">Bakiye (Borç)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">Kayıt Tarihi</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((customer) => (
                  <tr
                    key={customer.id}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => setDetailCustomer(customer)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{customer.name}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {customer.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone size={14} className="text-slate-400" />
                          {customer.phone}
                        </span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-bold ${customer.balance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {formatCurrency(customer.balance)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatDateTime(customer.created_at)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setEditing(customer); setShowForm(true); }}
                          className="text-slate-400 hover:text-blue-500"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`${customer.name} silinsin mi?`)) {
                              await deleteCustomer(customer.id);
                              reload();
                            }
                          }}
                          className="text-slate-400 hover:text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Form Modal */}
      {showForm && (
        <CustomerForm
          customer={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); reload(); }}
        />
      )}

      {/* Customer Detail Modal */}
      {detailCustomer && (
        <CustomerDetail
          customer={detailCustomer}
          onClose={() => setDetailCustomer(null)}
          onPayDebt={async (amount) => {
            await payCustomerDebt(detailCustomer.id, amount);
            reload();
            setDetailCustomer(null);
          }}
        />
      )}
    </div>
  );
}

function CustomerForm({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Müşteri adı gerekli'); return; }
    setSaving(true);
    if (customer) {
      await updateCustomer(customer.id, name, phone);
    } else {
      await addCustomer(name, phone);
    }
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{customer ? 'Müşteri Düzenle' : 'Yeni Müşteri'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Müşteri Adı *</label>
            <input className="input text-base" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Telefon</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0xxx xxx xx xx" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary w-full py-3">
            {saving ? 'Kaydediliyor...' : customer ? 'Güncelle' : 'Müşteri Ekle'}
          </button>
        </form>
      </div>
    </div>
  );
}

function CustomerDetail({
  customer,
  onClose,
  onPayDebt,
}: {
  customer: Customer;
  onClose: () => void;
  onPayDebt: (amount: number) => void;
}) {
  const [payAmount, setPayAmount] = useState('');
  const [showPayForm, setShowPayForm] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{customer.name}</h2>
            {customer.phone && <p className="text-sm text-slate-500">{customer.phone}</p>}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
        </div>

        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
          <p className="text-sm text-amber-600">Veresiye Borç</p>
          <p className="text-3xl font-bold text-amber-700">{formatCurrency(customer.balance)}</p>
        </div>

        {showPayForm ? (
          <div className="space-y-3">
            <label className="label">Ödeme Tutarı</label>
            <input
              type="number"
              step="0.01"
              className="input text-lg"
              placeholder="0.00"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => onPayDebt(parseFloat(payAmount) || 0)}
                disabled={!payAmount || parseFloat(payAmount) <= 0}
                className="btn-success flex-1 py-2.5"
              >
                <Wallet size={18} />
                Borç Öde
              </button>
              <button onClick={() => setShowPayForm(false)} className="btn-secondary px-4 py-2.5">
                İptal
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setPayAmount(customer.balance.toString()); setShowPayForm(true); }}
            disabled={customer.balance <= 0}
            className="btn-success w-full py-3 disabled:opacity-40"
          >
            <Wallet size={18} />
            {customer.balance > 0 ? 'Borç Öde' : 'Borç Yok'}
          </button>
        )}
      </div>
    </div>
  );
}
