-- ============================================================
-- 09 — Dupla validação só para despesas de operacional
--
-- Regra anterior (gatilho trg_voucher_sod, função fn_voucher_sod): quem
-- lançou qualquer despesa num voucher não podia validá-lo.
--
-- Regra nova (decisão do Julio, 21/10/2026): financeiro e administrador
-- podem lançar despesas e validar o próprio voucher. A dupla validação
-- continua valendo para o que o operacional lança — e o operacional não tem
-- permissão de validar, então o voucher dele é sempre validado por outra
-- pessoa.
--
-- Única mudança na função: a recusa "Quem lançou despesa neste voucher não
-- pode validá-lo" passa a valer só quando quem valida NÃO é financeiro nem
-- administrador. O resto é idêntico à versão aplicada na homologação
-- (lida com pg_get_functiondef em 21/10/2026).
--
-- Não altera dados. Não desliga gatilhos (só troca o corpo da função, o
-- gatilho continua o mesmo). Pode ser rodado de novo. Sem dados de clientes.
-- ============================================================
begin;

create or replace function public.fn_voucher_sod()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = 'validated' and (old.status is distinct from 'validated') then
    if is_client() then
      if not can('fda_validar') then
        raise exception 'Perfil sem permissão para validar voucher';
      end if;
      new.validated_by := current_app_user();
      new.legacy_validation := false;
    end if;
    if new.validated_by is null and not new.legacy_validation then
      raise exception 'Validação exige usuário identificado';
    end if;
    -- segregação: só para quem não é financeiro nem administrador (09)
    if new.validated_by is not null
       and not exists (select 1 from app_user u
                        where u.id = new.validated_by and u.role in ('financeiro', 'admin'))
       and exists (select 1 from voucher_expense e
                    where e.voucher_id = new.id and e.created_by = new.validated_by) then
      raise exception 'Quem lançou despesa neste voucher não pode validá-lo';
    end if;
    new.validated_at := coalesce(case when is_client() then null else new.validated_at end, now());
  elsif new.status = 'pending' and old.status = 'validated' then
    new.validated_by := null; new.validated_at := null; new.legacy_validation := false;
  elsif is_client() and new.status = old.status then
    new.validated_by := old.validated_by; new.validated_at := old.validated_at;
    new.legacy_validation := old.legacy_validation;
  end if;
  return new;
end $function$;

commit;

-- ------------------------------------------------------------
-- Conferência (rodar depois, numa consulta separada):
--
--   select position('(09)' in pg_get_functiondef('public.fn_voucher_sod()'::regprocedure)) > 0
--          as regra_nova;
--
-- Esperado: true.
--
-- Para voltar à regra anterior: rodar de novo a função sem o trecho
-- "not exists (select 1 from app_user ...)".
-- ------------------------------------------------------------
