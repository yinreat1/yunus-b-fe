# ProPOS – Hesap Bazlı Personel Satış 3.4

Bu sürümde personel ayrımı saat/vardiya üzerinden değil, aktif personel hesabı üzerinden yapılır.

## Davranış
- Yunus Balaman hesabı açıkken yapılan çevrimiçi satışlar Yunus'un `staff_id` değeriyle kaydedilir.
- Mesut Balaman hesabı açıkken yapılan satışlar Mesut'un `staff_id` değeriyle kaydedilir.
- Saat 22:00 veya başka bir saat satış personelini değiştirmez.
- Personel değiştir / çıkış işlemi sistem ana şifresini yeniden istemeden personel giriş ekranına döner; sonraki personel kendi PIN'i ile giriş yapar.
- İnternet yokken kuyruğa alınan satışın personel ID/adı satış kuyruğuna kaydedilir. İnternet geri geldiğinde başka personel giriş yapmış olsa bile satış ilk personelin hesabında tamamlanır.
- Atomik satış RPC'si personel ID/adını çözüp `sales.staff_id` ve `stock_movements.staff_id` alanlarına yazar ve nakit/kart tahsilatında personel kazancını aynı işlem içinde oluşturur.
- Atomik RPC kullanılamayan eski/uyumlu geri dönüş akışında da satış ve stok hareketi personel ID'siyle kaydedilir.
- Raporlarda satış satırının ilk alanında personel adı, altında tarih/saat gösterilir.
- Raporlara personel filtresi eklendi: Tüm Personel, Yunus, Mesut ve Personel atanmamış.
- Satış detayında ve Çöp Kutusu görünümünde de personel adı gösterilir.

## Mevcut Supabase personelleri
- Yunus Balaman — admin — %5 kazanç payı
- Mesut Balaman — manager — %0 kazanç payı (istendiğinde Personel & Yetki ekranından değiştirilebilir)

## Not
Daha önce oluşturulmuş ve `sales.staff_id` alanı boş olan eski satışlar, hangi hesabın sattığı geçmişten güvenilir biçimde bilinmediği için otomatik olarak Yunus/Mesut'a dağıtılmaz. Bu sürümden sonraki yeni satışlar hesap bazlı kaydedilir.
