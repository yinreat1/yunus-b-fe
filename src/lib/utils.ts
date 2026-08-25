export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
  }).format(amount);
}

export function formatDateTime(date: string): string {
  return new Date(date).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatTime(date: string): string {
  return new Date(date).toLocaleString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateBarcode(): string {
  const prefix = '20';
  const random = Math.floor(10000000000 + Math.random() * 89999999999);
  return prefix + random.toString().slice(0, 11);
}

export const PAYMENT_METHODS = {
  cash: { label: 'Nakit', color: 'emerald' },
  card: { label: 'Kart', color: 'blue' },
  credit: { label: 'Veresiye', color: 'amber' },
} as const;

export type PaymentMethod = keyof typeof PAYMENT_METHODS;
