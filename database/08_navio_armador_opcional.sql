-- ============================================================
-- 08 — Armador do navio passa a ser opcional
--
-- Por quê: o armador vale por ESCALA (fica na cotação e na prestação), e um
-- mesmo navio pode ter armadores diferentes em momentos diferentes. No
-- cadastro do navio o armador vira só uma sugestão ("armador atual"), que
-- pode ficar vazia.
--
-- O que faz: tira a obrigatoriedade de `vessel.shipowner_id`. Não altera
-- nenhum dado, cotação ou prestação. Se a coluna já for opcional, não faz
-- nada. Pode ser rodado de novo. Sem dados de clientes.
-- ============================================================
begin;

alter table vessel alter column shipowner_id drop not null;

commit;

-- ------------------------------------------------------------
-- Conferência (rodar depois, numa consulta separada):
--
--   select is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'vessel'
--      and column_name = 'shipowner_id';
--
-- Esperado: YES.
-- ------------------------------------------------------------
