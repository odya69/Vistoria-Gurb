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

-- Tamanho do banco (mostrado na tela inicial do app). Pode rodar de novo sem problema.
create or replace function public.rel_tamanho(p text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  return jsonb_build_object(
    'banco',      pg_database_size(current_database()),
    'relatorios', pg_total_relation_size('public.relatorios'),
    'qtd',        (select count(*) from public.relatorios where not apagado));
end $$;
revoke execute on function public.rel_tamanho(text) from public;
grant execute on function public.rel_tamanho(text) to anon, authenticated;


-- ============================================================
-- HISTÓRICO DE ALTERAÇÕES E MOVIMENTAÇÕES (rode junto; pode repetir sem problema)
-- Registro só de inclusão: o app grava cada evento e ninguém edita ou apaga pelo app.
-- ============================================================
create table if not exists public.rel_historico (
  seq      bigserial primary key,
  eid      text   not null unique,          -- id único do evento (evita duplicar se o envio for repetido)
  rid      text   not null,                 -- id do processo (relatorios.id)
  quando   bigint not null,                 -- momento do evento (ms)
  autor    text,
  acao     text   not null,                 -- cadastrado, editado, vistoriado, revistoria, deferido, ...
  proc     text,                            -- nº do processo (cópia, para continuar legível se for excluído)
  tipo     text,
  endereco text,
  resumo   text,
  detalhes jsonb,                           -- lista de {campo, de, para}
  criado   bigint not null default (extract(epoch from clock_timestamp()) * 1000)::bigint
);
create index if not exists rel_historico_rid_idx    on public.rel_historico (rid, quando desc);
create index if not exists rel_historico_quando_idx on public.rel_historico (quando desc);

alter table public.rel_historico enable row level security;
revoke all on public.rel_historico from anon, authenticated;
revoke all on sequence public.rel_historico_seq_seq from anon, authenticated;

-- Grava uma lista de eventos. Eventos repetidos (mesmo eid) são ignorados.
create or replace function public.rel_hist_add(p text, evs jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  if jsonb_typeof(evs) <> 'array' then raise exception 'formato_invalido'; end if;
  with ins as (
    insert into rel_historico (eid, rid, quando, autor, acao, proc, tipo, endereco, resumo, detalhes)
    select left(e->>'eid', 80), left(e->>'rid', 80), coalesce((e->>'t')::bigint, 0),
           left(e->>'autor', 120), left(coalesce(e->>'acao', 'editado'), 40),
           left(e->>'proc', 120), left(e->>'tipo', 40), left(e->>'end', 300),
           left(e->>'resumo', 600),
           case when jsonb_typeof(e->'det') = 'array' then e->'det' else null end
    from jsonb_array_elements(evs) e
    where coalesce(e->>'eid', '') <> '' and coalesce(e->>'rid', '') <> ''
    on conflict (eid) do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end $$;

-- Lista eventos, do mais recente ao mais antigo. prid = só um processo (ou null = todos);
-- pantes = só eventos anteriores a esse momento (paginação); plim = quantidade (máx. 500).
create or replace function public.rel_hist_list(p text, prid text, pantes bigint, plim integer) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'eid', s.eid, 'rid', s.rid, 't', s.quando, 'autor', s.autor, 'acao', s.acao, 'proc', s.proc,
      'tipo', s.tipo, 'end', s.endereco, 'resumo', s.resumo, 'det', s.detalhes) order by s.quando desc, s.seq desc)
    from (select * from rel_historico
          where (prid is null or rid = prid) and (pantes is null or quando < pantes)
          order by quando desc, seq desc
          limit least(greatest(coalesce(plim, 200), 1), 500)) s), '[]'::jsonb);
end $$;

revoke execute on function public.rel_hist_add(text, jsonb), public.rel_hist_list(text, text, bigint, integer) from public;
grant  execute on function public.rel_hist_add(text, jsonb), public.rel_hist_list(text, text, bigint, integer) to anon, authenticated;
