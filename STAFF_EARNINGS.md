# Personel Tahsilat Kazancı

- Personel kartında `Çalışan payı (%)` belirlenir.
- Müşteri borcu ödendiğinde, ödemeyi yapan aktif personelin oranı tahsil edilen tutar üzerinden hesaplanır.
- Örnek: 100 TL tahsilat ve %5 oran = 5 TL kazanç.
- Kısmi ödeme yalnızca ödenen tutar üzerinden kazanç üretir.
- Kazanç kaydı `staff_earnings` tablosunda tutulur ve aynı ödeme için ikinci kez oluşturulmaz.
- Personel ekranında bugün ve son 31 gün kazancı ile hareketler gösterilir.

Günlük kazançlar `staff_daily_earnings` tablosunda personel+tarih bazında kalıcı tutulur. Geçmiş günler yeni ödeme geldikçe değil, ödeme anında upsert edilerek güncellenir.
