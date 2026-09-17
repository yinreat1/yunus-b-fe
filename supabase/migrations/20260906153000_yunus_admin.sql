-- Kullanıcının mevcut Yunus hesabını en üst yetki olan admin yapar.
-- İsim eşleşmesi bilinçli olarak yalnızca "Yunus" ile sınırlandırılmıştır.
update public.staff
set role = 'admin'
where lower(trim(name)) = 'yunus';
