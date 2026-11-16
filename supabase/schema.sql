-- Caixa Real: tabela única onde cada usuário guarda os dados da própria empresa.
-- Cole este texto inteiro no Supabase em "SQL Editor" → "New query" e clique em "Run".

create table if not exists public.caixa (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  dados jsonb not null,
  revisao bigint not null default 1,
  atualizado_em timestamptz not null default now()
);

-- Ninguém enxerga ou altera os dados de outra pessoa.
alter table public.caixa enable row level security;

drop policy if exists "dono le" on public.caixa;
drop policy if exists "dono cria" on public.caixa;
drop policy if exists "dono altera" on public.caixa;
drop policy if exists "dono apaga" on public.caixa;

create policy "dono le" on public.caixa for select to authenticated using ((select auth.uid()) = user_id);
create policy "dono cria" on public.caixa for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "dono altera" on public.caixa for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "dono apaga" on public.caixa for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.caixa from anon;
grant select, insert, update, delete on public.caixa to authenticated;
