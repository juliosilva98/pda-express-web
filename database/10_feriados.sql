-- ============================================================
-- 10 — Cadastro de feriados (nacionais e municipais)
--
-- Usado no cálculo do vigia portuário (Watchmen, modelo "tabela"): dias da
-- estadia que caem em feriado têm o valor de feriado. Feriado nacional vale
-- para todos os portos; municipal só para o porto indicado.
--
-- Regras de acesso:
--   - ler: qualquer usuário com login ativo no sistema;
--   - incluir/alterar: só quem tem a permissão "cadastros" (administrador).
--   - Não há exclusão: o sistema desativa (active = false).
--
-- Cria só a tabela nova. Não altera dados existentes. Pode ser rodado de
-- novo. Sem dados de clientes (as datas são cadastradas pela tela).
-- ============================================================
begin;

create table if not exists holiday (
  id           uuid primary key default gen_random_uuid(),
  legacy_id    text unique,
  holiday_date date not null,
  name         text not null,
  scope        text not null default 'nacional',
  port_id      uuid references port(id),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'holiday_scope_check') then
    alter table holiday add constraint holiday_scope_check check (scope in ('nacional', 'municipal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'holiday_municipal_tem_porto') then
    alter table holiday add constraint holiday_municipal_tem_porto check (scope = 'nacional' or port_id is not null);
  end if;
end $$;

create index if not exists holiday_date_idx on holiday (holiday_date);

alter table holiday enable row level security;

drop policy if exists holiday_ler on holiday;
create policy holiday_ler on holiday for select to authenticated
  using (current_app_user() is not null);

drop policy if exists holiday_gravar on holiday;
create policy holiday_gravar on holiday for all to authenticated
  using (can('cadastros')) with check (can('cadastros'));

revoke all on holiday from anon;
grant select, insert, update on holiday to authenticated;

commit;

-- ------------------------------------------------------------
-- Conferência (rodar depois, numa consulta separada):
--
--   select (select count(*) from holiday) as feriados,
--          (select relrowsecurity from pg_class where relname = 'holiday') as regras_ligadas;
--
-- Esperado logo depois de rodar: feriados = 0, regras_ligadas = true.
-- ------------------------------------------------------------
