-- MicroCaixa: pasta privada "cupons" para as fotos do Lançamento rápido.
-- Cole este texto inteiro no Supabase em "SQL Editor" → "New query" e clique em "Run". Pode rodar de novo sem problema.

-- 1. A pasta (privada: só abre com login, nunca por link público). Limite de 5 MB por foto, só imagens.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cupons', 'cupons', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2. Cada pessoa só mexe na própria subpasta (o nome da subpasta é o id do usuário).
drop policy if exists "cupons: dono le" on storage.objects;
drop policy if exists "cupons: dono envia" on storage.objects;
drop policy if exists "cupons: dono troca" on storage.objects;
drop policy if exists "cupons: dono apaga" on storage.objects;

create policy "cupons: dono le" on storage.objects for select to authenticated
  using (bucket_id = 'cupons' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cupons: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id = 'cupons' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cupons: dono troca" on storage.objects for update to authenticated
  using (bucket_id = 'cupons' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'cupons' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cupons: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id = 'cupons' and (storage.foldername(name))[1] = (select auth.uid())::text);
