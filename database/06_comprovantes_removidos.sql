-- ============================================================
-- 06 — Comprovantes removidos (consulta pela auditoria)
--
-- Por quê: remover um voucher ou uma despesa apaga em cascata o registro
-- do comprovante em `attachment` (o arquivo continua no Storage). A
-- auditoria (`audit_log`) guarda o registro completo de cada exclusão.
-- Esta visão junta essas informações para achar qualquer comprovante
-- removido: arquivo, caminho no Storage, despesa, voucher e prestação.
--
-- O que NÃO faz: não altera tabelas, gatilhos nem a forma como o banco
-- apaga. Só cria a visão `comprovante_removido`.
--
-- Segurança: `security_invoker` faz a visão obedecer às regras de acesso
-- (RLS) de quem consulta — quem não pode ler a auditoria não vê nada.
--
-- Pode ser rodado de novo sem duplicar nada. Sem dados de clientes.
-- ============================================================
begin;

create or replace view comprovante_removido
  with (security_invoker = true) as
select
  a.record_id::text                          as comprovante_id,
  a.changed_at                               as removido_em,
  a.changed_by                               as removido_por,
  a.before_data->>'file_name'                as arquivo,
  a.before_data->>'storage_path'             as caminho_storage,
  a.before_data->>'uploaded_at'              as enviado_em,
  a.before_data->>'expense_id'               as despesa_id,
  e.before_data->>'description'              as despesa_descricao,
  coalesce(e.before_data->>'voucher_id', '') as voucher_id,
  (v.id is not null)                         as voucher_removido,
  coalesce(v.before_data->>'fda_id', vv.fda_id::text) as prestacao_id
from audit_log a
left join audit_log e
  on e.table_name = 'voucher_expense' and e.action = 'delete'
 and e.record_id::text = a.before_data->>'expense_id'
left join audit_log v
  on v.table_name = 'voucher' and v.action = 'delete'
 and v.record_id::text = e.before_data->>'voucher_id'
left join voucher vv
  on vv.id::text = e.before_data->>'voucher_id'
where a.table_name = 'attachment'
  and a.action = 'delete'
  -- se o mesmo arquivo voltou a ter registro, não é um comprovante perdido
  and not exists (
    select 1 from attachment x
     where x.storage_path = a.before_data->>'storage_path'
  );

revoke all on comprovante_removido from anon;

commit;

-- ------------------------------------------------------------
-- Conferência (rodar depois, numa consulta separada):
--
--   select removido_em, arquivo, caminho_storage, voucher_removido, prestacao_id
--     from comprovante_removido
--    order by removido_em desc;
--
-- Esperado na homologação em 19/10/2026: pelo menos 1 linha — o
-- comprovante do voucher removido no teste, com voucher_removido = true.
-- ------------------------------------------------------------
