-- =====================================================================
--  PDA EXPRESS — ajustes para o sistema web
--  Versão 3.2 — 19/10/2026 (3.1 + begin/commit) — aplicar DEPOIS de 04_carga_homolog.sql
--  Situação: APLICADO na homologação em 19/10/2026, seguido do 04b (que fica fora do GitHub).
--  Não contém dados de clientes; pode ir para o GitHub.
--
--  1. Campo complementar (extra) nas tabelas da FDA: qualquer informação
--     que o sistema grave e que não tenha coluna própria fica guardada
--     aqui, em vez de ser descartada.
--  2. Ordem das despesas dentro do voucher (o PDF depende dela).
--  3. Despesa vinda do PDA (from_pda).
--  4. Configuração completa de empresa e navio no formato do sistema.
--  5. Plano de contas: código exibido (code) e ordem; inclui as contas
--     sem código no plano do armador e a segunda ocorrência do 4129301,
--     que tinham ficado de fora.
--  Roda inteiro ou não roda nada (begin/commit): se der erro no meio,
--  a regra de reabrir voucher não fica desligada.
-- =====================================================================

begin;

alter table fda             add column if not exists extra jsonb;
alter table voucher         add column if not exists extra jsonb;
alter table voucher_expense add column if not exists extra jsonb;
alter table fda_advance     add column if not exists extra jsonb;

alter table voucher_expense add column if not exists sort_order integer;
alter table voucher_expense add column if not exists from_pda boolean not null default false;

alter table company add column if not exists legacy_config jsonb;
alter table vessel  add column if not exists legacy_config jsonb;

-- as correções técnicas abaixo não são alterações de conteúdo: a regra
-- "despesa alterada reabre o voucher" fica desligada só durante elas
alter table voucher_expense disable trigger trg_reopen_expense;

-- ordem das despesas migradas: a carga gravou na sequência original,
-- e o registro de auditoria guarda essa sequência
update voucher_expense e set sort_order = s.rn
  from (select record_id,
               row_number() over (partition by after_data->>'voucher_id' order by id) as rn
          from audit_log
         where table_name = 'voucher_expense' and action = 'insert') s
 where e.id::text = s.record_id and e.sort_order is null;

-- despesas migradas que vieram do PDA: as do voucher de origem PDA
-- cuja descrição consta no previsto item a item
update voucher_expense e set from_pda = true
  from voucher v
 where v.id = e.voucher_id and v.source = 'pda' and not e.from_pda
   and (v.estimated_items @> jsonb_build_array(jsonb_build_object('description', e.description))
        or (v.estimated_items is null and e.description = v.estimated_from));

alter table voucher_expense enable trigger trg_reopen_expense;

-- plano de contas: código exibido e ordem
alter table account add column if not exists code text;
alter table account add column if not exists sort_order integer;
update account set code = ref where code is null;

insert into account (ref, name, grp, is_local, code, sort_order) values
  ('X-cargo_load-01','Shore Crane','cargo_load',false,'',56),
  ('X-cargo_load-02','HTT Certificate','cargo_load',false,'',57),
  ('X-cargo_load-03','Lashing Gang','cargo_load',false,'',58),
  ('X-cargo_load-04','Gang Standby','cargo_load',false,'',59),
  ('X-cargo_load-05','Lumber Loading Tax','cargo_load',false,'',60),
  ('X-cargo_disch-01','Forklift Hire','cargo_disch',false,'',81),
  ('X-cargo_disch-02','Shore Crane','cargo_disch',false,'',82),
  ('X-cargo_disch-03','Misc Cargo Costs','cargo_disch',false,'',83),
  ('X-securing-01','Light Tarps','securing',false,'',109),
  ('X-securing-02','OGMO','securing',false,'',110),
  ('X-equipment-01','Transport','equipment',false,'',118),
  ('X-misc-01','Freight Tax (Cargo linked)','misc',false,'4129301',133)
on conflict (ref) do nothing;

update account a set sort_order = o.n
  from (values ('4122001',1), ('4122002',2), ('4122003',3), ('4122004',4), ('4122005',5), ('4122006',6), ('4122007',7), ('4122502',8), ('4122503',9), ('4122012',10), ('4122101',11), ('4122102',12), ('4122103',13), ('4122104',14), ('4122105',15), ('4122106',16), ('4122108',17), ('4122109',18), ('4122201',19), ('4122202',20), ('4122203',21), ('4122204',22), ('4122205',23), ('4122206',24), ('4122301',25), ('4122401',26), ('4122402',27), ('4122501',28), ('4122805',29), ('4122806',30), ('4122807',31), ('4122008',32), ('LOC-01',33), ('LOC-02',34), ('4111101',35), ('4111103',36), ('4111104',37), ('4111106',38), ('4111108',39), ('4111109',40), ('4111111',41), ('4111112',42), ('4111121',43), ('4111122',44), ('4111123',45), ('4111131',46), ('4111135',47), ('4111137',48), ('4111141',49), ('4111150',50), ('4111151',51), ('4111155',52), ('4111157',53), ('4111197',54), ('4129301',55), ('4111201',61), ('4111203',62), ('4111204',63), ('4111206',64), ('4111207',65), ('4111208',66), ('4111209',67), ('4111211',68), ('4111212',69), ('4111221',70), ('4111222',71), ('4111231',72), ('4111235',73), ('4111237',74), ('4111241',75), ('4111250',76), ('4111251',77), ('4111255',78), ('4111257',79), ('4111281',80), ('4112101',84), ('4112102',85), ('4112103',86), ('4112104',87), ('4112105',88), ('4112106',89), ('4112107',90), ('4112109',91), ('4112201',92), ('4112202',93), ('4112203',94), ('4112204',95), ('4112205',96), ('4112206',97), ('4112207',98), ('4112209',99), ('4123102',100), ('4123103',101), ('4123104',102), ('4123111',103), ('4123115',104), ('4123121',105), ('4123122',106), ('4123131',107), ('4123135',108), ('4132107',111), ('4132207',112), ('4132307',113), ('4132407',114), ('4132507',115), ('4132607',116), ('4132707',117), ('4129002',119), ('4129003',120), ('4129006',121), ('4129008',122), ('4129009',123), ('4129010',124), ('4129011',125), ('4129101',126), ('4129104',127), ('4129105',128), ('4129108',129), ('4129202',130), ('4129204',131), ('4129205',132), ('4129911',134), ('4129001',135), ('1170403',136), ('8.01',137), ('8.02',138), ('8.03',139), ('8.04',140), ('8.05',141), ('8.06',142), ('8.07',143), ('8.08',144), ('8.09',145), ('8.10',146), ('8.11',147), ('8.12',148), ('8.13',149), ('8.14',150), ('8.15',151)) as o(ref, n)
 where a.ref = o.ref;

commit;

-- fim
