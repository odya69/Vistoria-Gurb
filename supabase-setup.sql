-- ============================================================
-- CONFIGURAÇÃO DO BANCO COMPARTILHADO (rode UMA vez)
-- Supabase > SQL Editor > New query > cole tudo > Run
-- Sem senha: quem abrir o app vê e edita os relatórios.
-- ============================================================

create table if not exists public.rel_config (k text primary key, v text not null);
create table if not exists public.relatorios (
  id         text primary key,
  tipo       text,
  dados      jsonb,
  t          bigint  not null default 0,
  apagado    boolean not null default false,
  atualizado bigint  not null
);
create index if not exists relatorios_atualizado_idx on public.relatorios (atualizado);

delete from public.rel_config where k = 'pw_hash';  -- remove a senha antiga, se existir

-- As tabelas só são acessadas pelas funções abaixo.
alter table public.rel_config enable row level security;
alter table public.relatorios enable row level security;
revoke all on public.rel_config, public.relatorios from anon, authenticated;

create or replace function public._rel_ok(p text) returns boolean
language sql security definer set search_path = public as $$ select true; $$;

create or replace function public.rel_check(p text) returns boolean
language sql security definer set search_path = public as $$ select public._rel_ok(p); $$;

create or replace function public.rel_list(p text, since bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'tipo', tipo, 'dados', dados, 't', t, 'apagado', apagado, 'atualizado', atualizado))
    from relatorios where atualizado > since), '[]'::jsonb);
end $$;

create or replace function public.rel_put(p text, rid text, rtipo text, rdados jsonb, rt bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare ts bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  insert into relatorios (id, tipo, dados, t, apagado, atualizado)
  values (rid, rtipo, rdados, rt, false, ts)
  on conflict (id) do update
    set tipo = excluded.tipo, dados = excluded.dados, t = excluded.t, apagado = false, atualizado = excluded.atualizado
    where relatorios.t <= excluded.t;
  return ts;
end $$;

create or replace function public.rel_del(p text, rid text, rt bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare ts bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  insert into relatorios (id, tipo, dados, t, apagado, atualizado)
  values (rid, null, null, rt, true, ts)
  on conflict (id) do update
    set dados = null, t = excluded.t, apagado = true, atualizado = excluded.atualizado
    where relatorios.t <= excluded.t;
  return ts;
end $$;

revoke execute on function public._rel_ok(text) from public, anon, authenticated;
revoke execute on function public.rel_check(text), public.rel_list(text,bigint),
  public.rel_put(text,text,text,jsonb,bigint), public.rel_del(text,text,bigint) from public;
grant execute on function public.rel_check(text), public.rel_list(text,bigint),
  public.rel_put(text,text,text,jsonb,bigint), public.rel_del(text,text,bigint) to anon, authenticated;
