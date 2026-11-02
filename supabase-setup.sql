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


-- ============================================================
-- ATUALIZAÇÃO v2 DA SINCRONIZAÇÃO (rode junto; pode repetir sem problema)
-- Corrige: aparelhos que não baixavam por timeout, escritas ignoradas em silêncio
-- por causa de relógio errado, e dá ao app informações para mostrar o erro certo.
-- ============================================================

-- 1) Mais tempo para o papel anon (o padrão do Supabase é ~3 s e estoura com relatórios com muitas fotos)
alter role anon set statement_timeout = '30s';

-- 2) Hora do servidor: o app mede o quanto o relógio de cada aparelho está errado
create or replace function public.rel_agora(p text) returns bigint
language sql security definer set search_path = public as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

-- 3) Download em páginas: nunca devolve tudo de uma vez.
--    Devolve {rows:[...], mais:true/false}; sempre inclui ao menos 1 relatório por página.
create or replace function public.rel_list_pag(p text, since bigint, maxbytes integer default 2500000, maxrows integer default 30) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; ha boolean := false; ult bigint;
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  maxrows := least(greatest(coalesce(maxrows, 30), 1), 200);
  maxbytes := greatest(coalesce(maxbytes, 2500000), 100000);
  with base as (
    select id, atualizado,
           coalesce(pg_column_size(dados), 0) + 300 as sz,
           row_number() over (order by atualizado, id) as rn
    from relatorios where atualizado > since
    order by atualizado, id
    limit maxrows + 1
  ), acc as (
    select id, atualizado, rn, sum(sz) over (order by atualizado, id) as total from base
  ), pick as (
    select id, atualizado, rn from acc
    where rn <= maxrows and (rn = 1 or total <= maxbytes)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', x.id, 'tipo', x.tipo, 'dados', x.dados, 't', x.t, 'apagado', x.apagado, 'atualizado', x.atualizado)
           order by x.atualizado, x.id), '[]'::jsonb),
         max(x.atualizado)
    into r, ult
  from pick k join relatorios x on x.id = k.id;
  if ult is not null then
    select exists(select 1 from relatorios where atualizado > ult) into ha;
  end if;
  return jsonb_build_object('rows', r, 'mais', ha);
end $$;

-- 4) Gravar informando se foi aceito. t no futuro (relógio adiantado) é limitado a "agora + 1 min",
--    para um aparelho com a hora errada não bloquear as edições dos outros.
create or replace function public.rel_put2(p text, rid text, rtipo text, rdados jsonb, rt bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ts bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        t2 bigint; n integer; tsrv bigint;
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  t2 := least(coalesce(rt, 0), ts + 60000);
  insert into relatorios (id, tipo, dados, t, apagado, atualizado)
  values (rid, rtipo, rdados, t2, false, ts)
  on conflict (id) do update
    set tipo = excluded.tipo, dados = excluded.dados, t = excluded.t, apagado = false, atualizado = excluded.atualizado
    where relatorios.t <= excluded.t;
  get diagnostics n = row_count;
  select t into tsrv from relatorios where id = rid;
  return jsonb_build_object('ts', ts, 'aceito', n > 0, 't', tsrv);
end $$;

create or replace function public.rel_del2(p text, rid text, rt bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ts bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        t2 bigint; n integer; tsrv bigint;
begin
  if not public._rel_ok(p) then raise exception 'senha_invalida'; end if;
  t2 := least(coalesce(rt, 0), ts + 60000);
  insert into relatorios (id, tipo, dados, t, apagado, atualizado)
  values (rid, null, null, t2, true, ts)
  on conflict (id) do update
    set dados = null, t = excluded.t, apagado = true, atualizado = excluded.atualizado
    where relatorios.t <= excluded.t;
  get diagnostics n = row_count;
  select t into tsrv from relatorios where id = rid;
  return jsonb_build_object('ts', ts, 'aceito', n > 0, 't', tsrv);
end $$;

revoke execute on function public.rel_agora(text), public.rel_list_pag(text,bigint,integer,integer),
  public.rel_put2(text,text,text,jsonb,bigint), public.rel_del2(text,text,bigint) from public;
grant execute on function public.rel_agora(text), public.rel_list_pag(text,bigint,integer,integer),
  public.rel_put2(text,text,text,jsonb,bigint), public.rel_del2(text,text,bigint) to anon, authenticated;

-- 5) Limpeza única (segura de repetir)
-- 5a) relatórios que ficaram com t no futuro por causa de relógio errado voltam a aceitar edições dos outros aparelhos
update public.relatorios set t = least(t, atualizado) where t > atualizado + 60000;
-- 5b) registros "lixo" de exclusão criados por um defeito antigo do app (id terminando em #t)
delete from public.relatorios where id like '%#t' and apagado;

-- 6) Faz o Supabase enxergar as funções novas na hora
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
