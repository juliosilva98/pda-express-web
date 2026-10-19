-- ============================================================
-- 07 — SDA (Supplementary Disbursement Account)
--
-- A SDA é uma prestação de contas suplementar, feita depois do FDA
-- finalizado. Por dentro é igual ao FDA (vouchers, despesas, comprovantes,
-- adiantamentos, fechamento), por isso fica na mesma tabela `fda`, com:
--   kind           'fda' (padrão, inclusive para todas as existentes) ou 'sda'
--   parent_fda_id  FDA de origem; vazio na SDA avulsa
--
-- Regras aplicadas pelo banco (gatilho trg_fda_sda):
--   - só SDA tem FDA de origem;
--   - o FDA de origem precisa existir, ser FDA (não outra SDA) e estar
--     finalizado;
--   - o tipo (FDA/SDA) não muda depois de criado.
--
-- Não altera dados existentes além de preencher kind = 'fda'. Não desliga
-- nenhum gatilho. Pode ser rodado de novo sem duplicar nada. Sem dados de
-- clientes.
-- ============================================================
begin;

alter table fda add column if not exists kind text not null default 'fda';
alter table fda add column if not exists parent_fda_id uuid references fda(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fda_kind_check') then
    alter table fda add constraint fda_kind_check check (kind in ('fda', 'sda'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fda_parent_so_sda') then
    alter table fda add constraint fda_parent_so_sda check (parent_fda_id is null or kind = 'sda');
  end if;
end $$;

create index if not exists fda_parent_fda_id_idx on fda (parent_fda_id);

create or replace function fda_sda_regras() returns trigger
language plpgsql as $$
declare
  p record;
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'O tipo da prestação (FDA ou SDA) não pode ser alterado';
  end if;
  if new.parent_fda_id is not null
     and (tg_op = 'INSERT' or new.parent_fda_id is distinct from old.parent_fda_id) then
    select kind, status into p from fda where id = new.parent_fda_id;
    if not found then
      raise exception 'FDA de origem não encontrado';
    end if;
    if p.kind <> 'fda' then
      raise exception 'A SDA precisa partir de um FDA, não de outra SDA';
    end if;
    if p.status <> 'closed' then
      raise exception 'A SDA só pode partir de um FDA finalizado';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_fda_sda on fda;
create trigger trg_fda_sda
  before insert or update on fda
  for each row execute function fda_sda_regras();

-- caso as permissões da tabela tenham sido dadas coluna a coluna
grant select (kind, parent_fda_id), insert (kind, parent_fda_id) on fda to authenticated;

commit;

-- ------------------------------------------------------------
-- Conferência (rodar depois, numa consulta separada):
--
--   select kind, count(*) as prestacoes, count(parent_fda_id) as com_origem
--     from fda group by kind;
--
-- Esperado logo depois de rodar: uma linha só, kind = 'fda', com o total
-- de prestações e com_origem = 0.
-- ------------------------------------------------------------
