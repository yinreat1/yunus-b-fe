import { useMemo, useState } from 'react';
import { CalendarDays, TrendingUp, Wallet, BadgePercent } from 'lucide-react';
import { useStaff, useStaffEarnings } from '@/lib/hooks';
import { formatCurrency, formatDateTime } from '@/lib/utils';

type Period = 7 | 31 | 90;
const SESSION_KEY = 'propos-current-staff-v2';

function getCurrentStaffId(): string {
  try {
    return (JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') as { id?: string } | null)?.id || '';
  } catch {
    return '';
  }
}

export default function EarningsPage() {
  const [period, setPeriod] = useState<Period>(31);
  const { staff } = useStaff();
  const mineId = getCurrentStaffId();
  const mine = staff.find((s) => s.id === mineId) || null;
  const { earnings, daily, loading } = useStaffEarnings(mine?.id, period);

  const total = useMemo(
    () => earnings.reduce((sum, item) => sum + Number(item.earning_amount || 0), 0),
    [earnings],
  );
  const paid = useMemo(
    () => earnings.reduce((sum, item) => sum + Number(item.amount_paid || 0), 0),
    [earnings],
  );
  const count = earnings.length;
  const averageRate = useMemo(() => {
    if (!earnings.length) return Number(mine?.earning_rate || 0);
    return earnings.reduce((sum, item) => sum + Number(item.rate_percent || 0), 0) / earnings.length;
  }, [earnings, mine?.earning_rate]);

  const byDay = useMemo(() => {
    if (daily.length) return daily.map((d) => [new Date(`${d.earning_date}T00:00:00`).toLocaleDateString('tr-TR'), Number(d.earning_amount || 0)] as [string, number]);
    const map = new Map<string, number>();
    for (const item of earnings) {
      const date = new Date(item.created_at).toLocaleDateString('tr-TR');
      map.set(date, (map.get(date) || 0) + Number(item.earning_amount || 0));
    }
    return [...map.entries()];
  }, [daily, earnings]);

  if (!mine) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="card w-full max-w-lg p-8 text-center">
          <Wallet className="mx-auto mb-4 text-slate-400" size={40} />
          <h1 className="text-xl font-bold text-slate-800">Kazancım</h1>
          <p className="mt-2 text-sm text-slate-500">Aktif personel oturumu bulunamadı. Personel hesabınızla yeniden giriş yapın.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Kazancım</h1>
            <p className="text-sm text-slate-500">Müşterilerden tahsil edilen ödemeler üzerinden oluşan çalışan payınız.</p>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
            {[7, 31, 90].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value as Period)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold ${period === value ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-white'}`}
              >
                {value === 7 ? '7 Gün' : value === 31 ? '31 Gün' : '90 Gün'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-5">
              <div className="flex items-center gap-2 text-slate-500"><Wallet size={18} /><span className="text-xs font-semibold">Toplam kazancım</span></div>
              <p className="mt-2 text-3xl font-black text-emerald-700">{formatCurrency(total)}</p>
              <p className="mt-1 text-xs text-slate-400">Son {period} gün</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-slate-500"><TrendingUp size={18} /><span className="text-xs font-semibold">Tahsil edilen tutar</span></div>
              <p className="mt-2 text-2xl font-black text-slate-800">{formatCurrency(paid)}</p>
              <p className="mt-1 text-xs text-slate-400">Kazanca esas ödeme</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-slate-500"><BadgePercent size={18} /><span className="text-xs font-semibold">Pay oranım</span></div>
              <p className="mt-2 text-3xl font-black text-slate-800">%{averageRate.toFixed(2)}</p>
              <p className="mt-1 text-xs text-slate-400">Personel ayarı</p>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-slate-500"><CalendarDays size={18} /><span className="text-xs font-semibold">Tahsilat sayısı</span></div>
              <p className="mt-2 text-3xl font-black text-slate-800">{count}</p>
              <p className="mt-1 text-xs text-slate-400">Kazanç oluşturan ödeme</p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1.9fr]">
            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-bold text-slate-800">Günlük kazanç</h2>
                <p className="text-xs text-slate-400">{period} günlük dönem</p>
              </div>
              {byDay.length === 0 ? (
                <div className="p-6 text-sm text-slate-400">Henüz kazanç oluşmamış.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {byDay.map(([date, amount]) => (
                    <div key={date} className="flex items-center justify-between px-5 py-3">
                      <span className="text-sm text-slate-600">{date}</span>
                      <span className="font-bold text-emerald-700">{formatCurrency(amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <h2 className="font-bold text-slate-800">Tahsilatlara göre kazancım</h2>
                <p className="text-xs text-slate-400">Müşteri ödeme yaptığı anda oluşur.</p>
              </div>
              {loading ? (
                <div className="p-6 text-sm text-slate-400">Kazançlar yükleniyor...</div>
              ) : earnings.length === 0 ? (
                <div className="p-6 text-sm text-slate-400">Bu dönemde müşteri tahsilatından oluşan kazanç yok.</div>
              ) : (
                <div className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                  {earnings.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">Tahsilat {formatCurrency(item.amount_paid)}</p>
                        <p className="text-xs text-slate-400">%{Number(item.rate_percent).toFixed(2)} pay • {formatDateTime(item.created_at)}</p>
                      </div>
                      <p className="shrink-0 font-black text-emerald-700">+{formatCurrency(item.earning_amount)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
