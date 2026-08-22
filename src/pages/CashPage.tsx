import { useState, useMemo } from 'react';
import { Calculator, Lock, Unlock, Banknote, CreditCard, BookOpen, TrendingUp, Receipt, Calendar, X, Printer } from 'lucide-react';
import {
  useActiveCashSession,
  useCashSessions,
  openCashSession,
  closeCashSession,
  useSales,
} from '@/lib/hooks';
import { formatCurrency, formatDateTime, PAYMENT_METHODS } from '@/lib/utils';
import type { CashSession } from '@/lib/supabase';

export default function CashPage() {
  const { session, loading, reload } = useActiveCashSession();
  const { sessions, reload: reloadSessions } = useCashSessions(30);
  const { sales } = useSales(500);

  const [showOpenForm, setShowOpenForm] = useState(false);
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CashSession | null>(null);

  // Bugünkü satışlar (eğer kasa açıksa, kasa açılış saatinden itibaren)
  const sessionSales = useMemo(() => {
    if (!session) return [];
    const openedAt = new Date(session.opened_at).getTime();
    return sales.filter((s) => new Date(s.created_at).getTime() >= openedAt);
  }, [sales, session]);

  const cashTotal = sessionSales.filter((s) => s.payment_method === 'cash').reduce((sum, s) => sum + parseFloat(s.total.toString()), 0);
  const cardTotal = sessionSales.filter((s) => s.payment_method === 'card').reduce((sum, s) => sum + parseFloat(s.total.toString()), 0);
  const creditTotal = sessionSales.filter((s) => s.payment_method === 'credit').reduce((sum, s) => sum + parseFloat(s.total.toString()), 0);
  const grandTotal = cashTotal + cardTotal + creditTotal;
  const saleCount = sessionSales.length;

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-slate-400">Yükleniyor...</div>;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Kasa & Gün Sonu</h1>
            <p className="text-sm text-slate-500">Kasa oturumu aç, gün sonu raporu al</p>
          </div>
          {session ? (
            <button onClick={() => setShowCloseForm(true)} className="btn-primary px-4 py-2">
              <Lock size={18} />
              Kasa Kapat (Gün Sonu)
            </button>
          ) : (
            <button onClick={() => setShowOpenForm(true)} className="btn-success px-4 py-2">
              <Unlock size={18} />
              Kasa Aç
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Current Session Status */}
          {session ? (
            <div className="card border-teal-200 bg-teal-50 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
                  <Calculator className="text-white" size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-teal-800">Kasa Açık</h2>
                  <p className="text-sm text-teal-600">{formatDateTime(session.opened_at)} tarihinde açıldı</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg bg-white p-4 border border-teal-100">
                  <p className="text-sm text-slate-500">Açılış Nakiti</p>
                  <p className="text-xl font-bold text-slate-800">{formatCurrency(session.opening_amount)}</p>
                </div>
                <div className="rounded-lg bg-white p-4 border border-teal-100">
                  <p className="text-sm text-slate-500">Satış Adedi</p>
                  <p className="text-xl font-bold text-slate-800">{saleCount}</p>
                </div>
                <div className="rounded-lg bg-white p-4 border border-teal-100">
                  <p className="text-sm text-slate-500">Toplam Ciroyu</p>
                  <p className="text-xl font-bold text-teal-700">{formatCurrency(grandTotal)}</p>
                </div>
                <div className="rounded-lg bg-white p-4 border border-teal-100">
                  <p className="text-sm text-slate-500">Kasada Olması Gereken</p>
                  <p className="text-xl font-bold text-emerald-700">{formatCurrency(session.opening_amount + cashTotal)}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Lock className="text-slate-400" size={24} />
              </div>
              <h2 className="text-lg font-bold text-slate-700">Kasa Kapalı</h2>
              <p className="mb-4 text-sm text-slate-500">Satış yapmaya başlamak için kasayı açın</p>
              <button onClick={() => setShowOpenForm(true)} className="btn-success px-6 py-2.5">
                <Unlock size={18} />
                Kasa Aç
              </button>
            </div>
          )}

          {/* Sales Breakdown */}
          {session && sessionSales.length > 0 && (
            <div className="card p-6">
              <h3 className="mb-4 font-bold text-slate-800">Bu Oturumdaki Satışlar</h3>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-emerald-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Banknote className="text-emerald-600" size={20} />
                    <span className="text-sm text-slate-600">Nakit</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-700">{formatCurrency(cashTotal)}</p>
                  <p className="text-xs text-slate-400 mt-1">{sessionSales.filter((s) => s.payment_method === 'cash').length} satış</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <CreditCard className="text-blue-600" size={20} />
                    <span className="text-sm text-slate-600">Kart</span>
                  </div>
                  <p className="text-xl font-bold text-blue-700">{formatCurrency(cardTotal)}</p>
                  <p className="text-xs text-slate-400 mt-1">{sessionSales.filter((s) => s.payment_method === 'card').length} satış</p>
                </div>
                <div className="rounded-lg bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <BookOpen className="text-amber-600" size={20} />
                    <span className="text-sm text-slate-600">Veresiye</span>
                  </div>
                  <p className="text-xl font-bold text-amber-700">{formatCurrency(creditTotal)}</p>
                  <p className="text-xs text-slate-400 mt-1">{sessionSales.filter((s) => s.payment_method === 'credit').length} satış</p>
                </div>
              </div>
            </div>
          )}

          {/* Session History */}
          <div className="card overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h3 className="font-semibold text-slate-800">Kasa Oturum Geçmişi</h3>
            </div>
            {sessions.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Henüz kasa oturumu yok</div>
            ) : (
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Açılış</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-slate-600">Kapanış</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600">Açılış</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-slate-600">Kapanış</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-slate-600">Durum</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => setSelectedSession(s)}
                    >
                      <td className="px-4 py-3 text-sm text-slate-600">{formatDateTime(s.opened_at)}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {s.closed_at ? formatDateTime(s.closed_at) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                        {formatCurrency(s.opening_amount)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                        {s.closing_amount != null ? formatCurrency(s.closing_amount) : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === 'open' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {s.status === 'open' ? 'Açık' : 'Kapalı'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400"><Receipt size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Open Cash Form */}
      {showOpenForm && (
        <OpenCashForm
          onClose={() => setShowOpenForm(false)}
          onOpen={async (amount, note) => {
            await openCashSession(amount, note);
            setShowOpenForm(false);
            reload();
            reloadSessions();
          }}
        />
      )}

      {/* Close Cash Form */}
      {showCloseForm && session && (
        <CloseCashForm
          session={session}
          expectedCash={session.opening_amount + cashTotal}
          cashSales={cashTotal}
          cardSales={cardTotal}
          creditSales={creditTotal}
          saleCount={saleCount}
          onClose={() => setShowCloseForm(false)}
          onCloseSession={async (amount, note) => {
            await closeCashSession(session.id, amount, note);
            setShowCloseForm(false);
            reload();
            reloadSessions();
          }}
        />
      )}

      {/* Session Detail */}
      {selectedSession && (
        <SessionDetailModal session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}
    </div>
  );
}

function OpenCashForm({ onClose, onOpen }: { onClose: () => void; onOpen: (amount: number, note?: string) => void }) {
  const [amount, setAmount] = useState('0');
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Kasa Aç</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Açılış Nakiti (TL)</label>
            <input
              type="number"
              step="0.01"
              className="input text-lg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-400">Kasaya başlangıçta ne kadar nakit var?</p>
          </div>
          <div>
            <label className="label">Not (opsiyonel)</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn: Sabah açılışı" />
          </div>
          <button
            onClick={() => onOpen(parseFloat(amount) || 0, note.trim() || undefined)}
            className="btn-success w-full py-3"
          >
            <Unlock size={18} />
            Kasayı Aç
          </button>
        </div>
      </div>
    </div>
  );
}

function CloseCashForm({
  session,
  expectedCash,
  cashSales,
  cardSales,
  creditSales,
  saleCount,
  onClose,
  onCloseSession,
}: {
  session: CashSession;
  expectedCash: number;
  cashSales: number;
  cardSales: number;
  creditSales: number;
  saleCount: number;
  onClose: () => void;
  onCloseSession: (amount: number, note?: string) => void;
}) {
  const [countedCash, setCountedCash] = useState(expectedCash.toFixed(2));
  const [note, setNote] = useState('');
  const [showReport, setShowReport] = useState(false);

  const counted = parseFloat(countedCash) || 0;
  const diff = counted - expectedCash;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Gün Sonu - Kasa Kapat</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
        </div>

        {!showReport ? (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-lg bg-slate-50 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Açılış Nakiti</span>
                <span className="font-medium">{formatCurrency(session.opening_amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Nakit Satışlar</span>
                <span className="font-medium text-emerald-600">+{formatCurrency(cashSales)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Kart Satışlar</span>
                <span className="font-medium text-blue-600">{formatCurrency(cardSales)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Veresiye Satışlar</span>
                <span className="font-medium text-amber-600">{formatCurrency(creditSales)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Satış Adedi</span>
                <span className="font-medium">{saleCount}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold">
                <span>Kasada Olması Gereken</span>
                <span className="text-teal-700">{formatCurrency(expectedCash)}</span>
              </div>
            </div>

            <div>
              <label className="label">Sayılan Nakit (TL)</label>
              <input
                type="number"
                step="0.01"
                className="input text-lg"
                value={countedCash}
                onChange={(e) => setCountedCash(e.target.value)}
                autoFocus
              />
            </div>

            {diff !== 0 && (
              <div className={`rounded-lg p-3 text-center ${diff > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <p className={`text-sm ${diff > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {diff > 0 ? 'Fazla' : 'Eksik'}: {formatCurrency(Math.abs(diff))}
                </p>
              </div>
            )}

            <div>
              <label className="label">Not (opsiyonel)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gün sonu notu" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowReport(true)} className="btn-secondary flex-1 py-2.5">
                <Printer size={18} />
                Rapor Önizle
              </button>
              <button
                onClick={() => onCloseSession(counted, note.trim() || undefined)}
                className="btn-primary flex-1 py-2.5"
              >
                <Lock size={18} />
                Kasayı Kapat
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-dashed border-slate-200 p-4 font-mono text-sm" id="print-area">
              <div className="text-center mb-3">
                <p className="font-bold text-base">GÜN SONU RAPORU</p>
                <p className="text-slate-500 text-xs">{formatDateTime(session.opened_at)}</p>
                <p className="text-slate-500 text-xs">— {formatDateTime(new Date().toISOString())}</p>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between"><span>Açılış Nakiti</span><span>{formatCurrency(session.opening_amount)}</span></div>
                <div className="flex justify-between"><span>Nakit Satış</span><span>+{formatCurrency(cashSales)}</span></div>
                <div className="flex justify-between"><span>Kart Satış</span><span>{formatCurrency(cardSales)}</span></div>
                <div className="flex justify-between"><span>Veresiye Satış</span><span>{formatCurrency(creditSales)}</span></div>
                <div className="flex justify-between"><span>Satış Adedi</span><span>{saleCount}</span></div>
                <div className="border-t border-slate-300 pt-1 flex justify-between font-bold">
                  <span>Beklenen Kasa</span><span>{formatCurrency(expectedCash)}</span>
                </div>
                <div className="flex justify-between"><span>Sayılan Nakit</span><span>{formatCurrency(counted)}</span></div>
                <div className="flex justify-between font-bold">
                  <span>{diff >= 0 ? 'Fazla' : 'Eksik'}</span>
                  <span className={diff >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatCurrency(Math.abs(diff))}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => window.print()} className="btn-secondary flex-1 py-2.5">
                <Printer size={18} />
                Yazdır / PDF
              </button>
              <button onClick={() => setShowReport(false)} className="btn-primary flex-1 py-2.5">
                Geri
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionDetailModal({ session, onClose }: { session: CashSession; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-fade-in" onClick={onClose}>
      <div className="card w-full max-w-md p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Oturum Detayı</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={22} /></button>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Durum</span>
            <span className={`font-medium ${session.status === 'open' ? 'text-teal-600' : 'text-slate-600'}`}>
              {session.status === 'open' ? 'Açık' : 'Kapalı'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Açılış</span>
            <span className="font-medium">{formatDateTime(session.opened_at)}</span>
          </div>
          {session.closed_at && (
            <div className="flex justify-between">
              <span className="text-slate-500">Kapanış</span>
              <span className="font-medium">{formatDateTime(session.closed_at)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Açılış Nakiti</span>
            <span className="font-medium">{formatCurrency(session.opening_amount)}</span>
          </div>
          {session.closing_amount != null && (
            <div className="flex justify-between">
              <span className="text-slate-500">Kapanış Nakiti</span>
              <span className="font-medium">{formatCurrency(session.closing_amount)}</span>
            </div>
          )}
          {session.note && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-400 mb-1">Not</p>
              <p className="text-sm text-slate-600">{session.note}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
