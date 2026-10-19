# Gestão de Custeio Seatrade (antigo PDA Express) — contexto do projeto

**Atualizado em:** 19/10/2026
**Responsável:** Julio
**Para quem:** o Claude Code (e qualquer pessoa que continue o trabalho)

Este arquivo fica num repositório público. Ele descreve o sistema, as decisões
e o estado do trabalho **sem dados da empresa**. Nomes de clientes, navios,
contas e valores ficam no registro privado do Julio (`RESUMO_PDA_EXPRESS_v2.md`
e anteriores), fora do GitHub.

---

## 1. Situação em 19/10/2026

- **Entrega 2 (sistema completo na web) publicada na homologação** e em teste
  pelo Julio. Ela substituiu a entrega 1 (login + painel de diagnóstico).
- Banco de homologação com os ajustes 05 e 04b aplicados.
- Testes manuais 1 a 6 aprovados no site (seção 8). O teste 6 (finalizar e
  reabrir) passou depois que as correções de 19/10 foram enviadas ao GitHub
  (seção 9, itens 6 e 8).
- Último envio ao GitHub: 19/10/2026 (commit `b9195fd`, "Add files via
  upload").
- No computador do Julio não há Git. Os envios são feitos pelo site do GitHub
  (Add file › Upload files), e a cópia de trabalho fica em
  `OneDrive - Seatrade\Projeto gestão de Custeio Seatrade\pda-express-web`.
- Node 20.18.0 **portátil** (zip oficial do nodejs.org, SHA-256 conferido) em
  `%LOCALAPPDATA%\node-portable\node-v20.18.0-win-x64`. Build e testes rodam
  numa cópia fora do OneDrive, `%USERPROFILE%\pdx-build` (o OneDrive não deve
  sincronizar `node_modules`; e `%LOCALAPPDATA%` não serve para o build porque
  o app do Claude redireciona essa pasta e o Vite falha). Ver "Comandos" no
  `CLAUDE.md`.
- **Pacote de mudanças de 19/10 à tarde (não publicado ainda):** nome do
  sistema → "Gestão de Custeio Seatrade"; menu ⋯ na coluna Ações; pré-
  visualização dos PDFs; cabeçalho do FDA buscando PDA e navio; SDA
  (seção 12). Exige rodar o `database/07_sda.sql` antes de usar a SDA.
- **Produção ainda não existe.** Tudo o que está no ar é homologação.
- Decisão de 19/10: o trabalho continua **só neste repositório**
  (`pda-express-web`). O repositório privado `pda-express` fica como arquivo
  (seção 11).

## 2. Versões

| Item | Versão |
|---|---|
| Sistema antigo de origem | v28 do artifact do claude.ai (com Backup e exportação) |
| Sistema web | entrega 2 + correções de 19/10/2026 (`package.json` 0.1.0) |
| React / React DOM | 18.3.1 |
| Vite / @vitejs/plugin-react | 5.4.11 / 4.3.4 |
| @supabase/supabase-js | 2.45.4 (sessão no navegador, `flowType: 'implicit'`) |
| pdf-lib | 1.17.1 (geração de PDF no navegador, exposta como `window.PDFLib`) |
| Node no GitHub Actions | 20 |
| Banco | arquivos 01 → 02 → 03 → 04 → 05 (v3.2) → 04b → 06 aplicados na homologação; 07 (SDA) escrito, ainda não aplicado |

## 3. Linha do tempo

1. **Fase 0** — repositório privado, exportação dos dados do artifact com
   código de integridade (SHA-256), proteção.
2. **Fase 1** — Supabase de homologação (região São Paulo): esquema (01),
   segurança (02), estrutura de transição (03), carga dos dados reais (04).
   Conferência centavo por centavo com a exportação.
3. **Fase 2, entrega 1** — este repositório criado do zero (sem dados), login e
   painel de diagnóstico no ar.
4. **Fase 2, entrega 2** — sistema antigo levado inteiro para a web; 16/10
   código pronto; 19/10 revisão, correções, publicação na homologação e testes
   manuais (seções 8 e 9).
5. **Fase 3 (não iniciada)** — uso paralelo, cópia dos comprovantes antigos,
   projeto de produção.

## 4. Arquitetura e decisões

| Decisão | Motivo |
|---|---|
| Só GitHub Pages + Supabase (sem Vercel) | Escolha do Julio |
| Repositório público para o site | Pages gratuito exige; por isso nenhum dado aqui |
| Repositório privado separado | O sistema antigo tinha dados comerciais e bancários no código e no histórico |
| Chaves `VITE_*` em Secrets | Escondem os valores nos registros do Actions; a `service_role` nunca entra |
| Mudar de casa primeiro, reformar depois | Se algo mudar, foi a migração e não uma regra de negócio |
| Tarifas e cotações no formato antigo (`legacy_config`, `quotation_doc`) | O motor de cálculo continua igual; normalização depois, com regressão |
| Comprovantes nunca apagados | Auditoria; a despesa só deixa de apontar para o arquivo |
| Dupla conferência de conta bancária | Troca de conta em invoice é fraude comum no setor |
| O banco decide, o navegador obedece | RLS e gatilhos; o front-end só mostra o erro traduzido |

Publicação: push na `main` → `.github/workflows/publicar.yml` → `npm ci`,
`npm run build` → GitHub Pages. O site fica em
`https://<usuario>.github.io/pda-express-web/` (`base` no `vite.config.js`).
Supabase: cadastro público desligado (só convidados); Site URL e Redirect URL =
endereço do site.

## 5. Modelo de dados (o que o front-end usa)

**Cadastros:** `company`, `company_branch`, `company_bank_account`, `port`,
`terminal`, `supplier`, `supplier_port`, `shipowner`, `vessel`, `account`
(plano de contas), `quotation_doc` (cotação inteira em JSON, campo `data`).

**Prestação de contas:** `fda` → `voucher` → `voucher_expense` →
`attachment`; `fda_advance` (adiantamentos), `fda_export` (registro de cada
PDF gerado: tipo `plain` ou `docs` e impressão digital do conteúdo),
`fda_event` (histórico).

**Acesso:** `app_user` (ligado ao login por `auth_id`), `role_permission`,
`access_request`, `audit_log`.

**Storage:** bucket privado `comprovantes` (PDF, PNG, JPEG, WEBP, XML; até
20 MB). Caminho dos novos: `fda/AAAA-MM/<uuid>.<ext>`. Os 17 comprovantes do
sistema antigo estão registrados com caminho `pendente/<id>` — os arquivos
ainda não foram copiados (Fase 3).

**Campos de transição:**
- `legacy_id` — id do sistema antigo; os ids do front-end continuam sendo os
  antigos, e `cadastros.js` mantém o mapa id antigo ↔ uuid (`mapa`, `rev`).
- `legacy_config` (porto, terminal, fornecedor, armador, empresa, navio) —
  objeto completo no formato do motor de cálculo.
- `extra` (fda, voucher, voucher_expense, fda_advance) — tudo o que o sistema
  grava e não tem coluna própria, para não descartar nada.
- `voucher_expense.sort_order` — ordem das despesas (o PDF depende dela).
- `voucher_expense.from_pda` — despesa que veio do PDA.
- `account.code` — código exibido; `account.ref` é o identificador interno.
  Contas sem código têm `ref` `X-<grupo>-NN` e `code` vazio. **O código
  4129301 existe em dois grupos**: traduzir código → conta sempre por grupo +
  código (`contas.grupoCodigo`).

**Situações:** FDA `open` / `closed` / cancelada; voucher `pending` /
`validated`; cotação `draft` / `approved` / `cancelled`.

## 6. Segurança (aplicada pelo banco)

| Permissão | admin | financeiro | operacional | leitura |
|---|:-:|:-:|:-:|:-:|
| ver | ✓ | ✓ | ✓ | ✓ |
| cadastros, usuarios, tarifas, conta_bancaria, auditoria | ✓ | | | |
| cotar | ✓ | ✓ | ✓ | |
| aprovar | ✓ | ✓ | | |
| fda_editar | ✓ | ✓ | ✓ | |
| fda_validar, fda_emitir, fda_finalizar, fda_adiantamento | ✓ | ✓ | | |
| fda_reabrir | ✓ | | | |

Regras do banco:
- RLS em todas as tabelas; sem login, nada.
- Autoria gravada pelo banco (ninguém lança em nome de outro).
- **Segregação:** quem lançou despesa num voucher não pode validá-lo
  (confirmado no site em 19/10).
- **Despesa alterada reabre o voucher** (gatilho `trg_reopen_expense`).
- Fechamento da FDA com as mesmas condições do sistema (seção 7).
- Conta bancária nova ou alterada fica "não conferida"; outra pessoa confere;
  FDA e armador só usam conta conferida. Exige dois administradores.
- Ninguém altera o próprio perfil; sempre resta um administrador ativo.
- Prestação não se exclui (cancela-se); cotação aprovada não se exclui.
- Auditoria imutável.
- Testado em 16/10 num PostgreSQL que simula o Supabase: 41 de 41 situações.

## 7. Como o front-end conversa com o banco

O sistema antigo rodava como artifact e usava `localStorage` (cadastros) e uma
API de documentos (`window.claude.use('db')`). A camada `src/plataforma/`
imita essas duas interfaces e traduz para tabelas:

- **Cadastros (`cadastros.js`):** o `App` chama `store.set` para cada chave ao
  abrir; a **primeira** chamada de cada chave é tratada como referência (eco da
  abertura) e não grava. Depois, cada `store.set` compara item a item e grava
  só o que mudou. Cadastros não são recarregados durante o uso: duas pessoas
  editando o mesmo item → vale a última gravação.
- **FDA e vouchers (`colecoes.js`):** `doc(...).update()` entra numa fila por
  documento (espera 350 ms, junta alterações, grava em sequência). Em erro, o
  documento é recarregado do banco e a mensagem aparece em aviso vermelho.
  Recarga automática a cada 30 s quando a aba está visível e nada está sendo
  gravado.
- **Fechamento:** para finalizar, o sistema exige todos os vouchers validados,
  comprovante em todas as despesas com valor, invoice com número e data, e o
  PDF (`docs` se houver comprovantes, senão `plain`) gerado **na versão atual**
  (impressão digital igual). O PDF só é registrado se `downloads.save`
  responder `{ status: 'saved' }`.
- **Voucher validado com despesa alterada:** quem reabre é o gatilho; o
  front-end só pede "pendente" se o voucher continuar validado.
- **Voucher manual:** o sistema antigo cria já "validado"; na web só nasce
  validado para quem tem `fda_validar`.
- **Gerar FDA a partir de PDA / duplicar:** cada voucher novo envia todas as
  despesas num único insert.
- **Adiantamentos:** gravados pelo uuid da linha (mapa `linhasAdv`), sem
  depender de restrição única em `legacy_id`.

## 8. Testes

**Automáticos (`npm test`, 23 testes, banco falso em memória):** adiantamento
(editar sem duplicar, incluir, excluir); despesa de voucher validado alterada
por operacional; validação recusada sem permissão; voucher manual por perfil;
despesas do PDA num envio, na ordem, editáveis; renumerar sem regravar
despesas; código 4129301 por grupo; download confirma `saved`.

**Feitos em 16/10 (fora deste repositório):** motor de cálculo antigo × novo,
9 de 9 idênticos; plano de contas do banco idêntico ao original; sistema
aberto contra PostgREST com as regras reais, lista de prestações conferindo
com a exportação.

**Manuais no site de homologação, 19/10, com NAVIO TESTE:**

| # | Teste | Resultado |
|---|---|---|
| 1 | Criar prestação e conferir após F5 | Aprovado |
| 2 | Voucher, duas despesas, ordem, editar sem duplicar; validar pela mesma pessoa | Aprovado (segregação recusou, como esperado) |
| 3 | Cadastrar usuário, convite por e-mail, criar senha, validar como financeiro | Aprovado |
| 4 | Alterar despesa de voucher validado (reabre sem erro), revalidar, adiantamento incluir/editar/excluir | Aprovado |
| 5 | Anexar e abrir comprovante, invoice, gerar PDF com comprovantes | Aprovado (download ok) |
| 6 | Finalizar e reabrir | Primeira tentativa travou (PDF não ficava registrado). Depois da correção: PDF com comprovantes registrado, finalizada por financeiro, botão de reabrir só para admin, reaberta por admin com motivo, histórico com as duas ações. Aprovado |

Observação do teste 6: depois de cada publicação, apertar **Ctrl+F5** antes de
testar; sem isso o navegador pode continuar com a versão anterior.

**Feitos pelo Julio e informados como aprovados em 19/10** (sem roteiro
registrado aqui): cancelar FDA; editar cadastro (porto, armador, navio) e
conferir após F5; nova cotação e gerar FDA a partir de PDA; rodada com usuário
**operacional** (lança e edita; não valida, finaliza, lança adiantamento nem
reabre) e com usuário **leitura**; excluir despesa e excluir voucher que têm
comprovante. Na exclusão de voucher, observado em 19/10 (prestação de teste
reaberta, voucher **validado** com 1 comprovante): o sistema pede confirmação
("Remover voucher"), o banco aceita, aparece "Voucher removido" e o aviso de
numeração fora de sequência com o botão **Renumerar**. Consulta no SQL Editor
mostrou que o arquivo continua no Storage, mas o registro em `attachment`
some junto com o voucher (seção 9, item 9).

**Falta testar:** conta bancária nova com dupla conferência (exige segundo
administrador).

## 9. Erros e correções

1. (16/10) As primeiras versões do 05 e do 04b reabriam vouchers validados
   durante a correção técnica. Corrigido: o gatilho é desligado só durante a
   correção e religado.
2. (19/10) 05 sem transação: se falhasse no meio, o gatilho podia ficar
   desligado. Corrigido com `begin`/`commit` (v3.2).
3. (19/10) Adiantamentos gravados por `upsert` em `legacy_id`: dependia de
   restrição única. Agora grava pelo uuid. (Com os dados atuais o risco era
   menor do que o Claude disse inicialmente: a carga gravou todos com
   `legacy_id`.)
4. (19/10) Voucher manual criado por operacional dava erro e ficava gravado
   pela metade. Corrigido.
5. (19/10) Código 4129301 traduzido sem considerar o grupo. Corrigido.
6. (19/10) `downloads.save` respondia `{ ok: true }`, mas o sistema espera
   `{ status: 'saved' }`: o PDF baixava, mas não era registrado (FDA nunca
   finalizava) e a mensagem de sucesso não aparecia em nenhum PDF. Corrigido;
   tem teste.
7. (19/10) Textos de exemplo e um comentário com nome de cliente, banco e
   navio reais no `sistema.jsx`, que a conferência de 16/10 não pegou.
   Trocados por exemplos genéricos. Um nome de navio (informação pública, sem
   dado comercial) ficou no histórico de versões do GitHub.
8. (19/10) Este arquivo dizia que as correções estavam prontas, mas não
   registrava se tinham sido publicadas. Comparação arquivo a arquivo com o
   GitHub mostrou que o último envio era de 16/10: faltavam a correção do item
   6 (`colecoes.js`), a troca do nome de navio do item 7 (`sistema.jsx`, ainda
   visível no site), o comando `npm test` (`package.json`) e as pastas
   `testes/`, `docs/`, `database/` e o `CLAUDE.md`. Sem Git neste computador,
   o envio é feito pelo site do GitHub (Add file › Upload files). Daqui em
   diante, ao fim de cada sessão, registrar aqui a data do último envio.
   Na primeira tentativa, o Claude pediu o envio sem mostrar o passo a passo;
   nada chegou ao GitHub, e o "verde" do Actions era a publicação de 16/10.
   Depois de cada envio, conferir a data do último commit, não só a cor.
9. (19/10) Remover um voucher (ou uma despesa) apaga também o
   registro do comprovante em `attachment`; o arquivo fica no Storage sem
   nada que aponte para ele. Contraria a regra "comprovantes nunca apagados".
   O front-end apaga só `voucher` / `voucher_expense` (`colecoes.js`); a
   remoção vem do banco: `attachment.expense_id` e
   `voucher_expense.voucher_id` são `on delete cascade` (conferido em 19/10).
   Nada se perde de fato: o `audit_log` guarda o registro completo
   (`action = 'delete'`, `before_data`), e o arquivo fica no Storage.
   Decisão: não mudar a cascata agora (os gatilhos de `attachment` não estão
   neste repositório e poderiam falhar com `expense_id` vazio). Em vez disso,
   `database/06_comprovantes_removidos.sql` cria a visão
   `comprovante_removido`, que lista cada comprovante removido com arquivo,
   caminho, despesa, voucher e prestação. Aplicado na homologação em 19/10;
   conferência devolveu 1 linha (o voucher removido no teste,
   `voucher_removido = true`). Para produção: rodar o 06 depois dos demais.

## 10. Pendências e próximos passos

**Do Julio, sobre os dados (detalhes no registro privado):** conferir o tipo
(granel/contêiner) dos navios, deduzido pelo armador; vincular 3 prestações
sem armador; refazer a conferência da conta bancária migrada quando houver
segundo administrador; 8 vouchers com "validação anterior ao controle"; 5
cotações ausentes (previsto preservado nos vouchers); copiar 17 comprovantes
do artifact antigo; NAVIO TESTE não migra para produção.

**Próximos passos:**
1. Definir o segundo administrador e fazer o último teste da seção 8 (conta
   bancária com dupla conferência).
2. Copiar os 17 comprovantes para o Storage.
3. Uso paralelo; criar o projeto de **produção** no Supabase, separado.
4. Itens de negócio herdados: tarifa dos vigias, vigência do TESC, período
   parcial de 6 h, padronização do SWIFT, Funapol por escala ou movimentação,
   tabelas de outros portos, conciliação PDA × FDA, indicadores, integração
   com o ERP.
5. Depois: MFA para admin e financeiro, domínio próprio, e-mail próprio no
   Supabase (o gratuito tem limite de envios), backup com restauração testada.

**Limitações conhecidas do código:** gravações em várias requisições não são
atômicas (falha no meio deixa parte gravada; a tela recarrega do banco);
arquivo enviado ao Storage fica órfão se a despesa não gravar; cadastros sem
recarga automática; `sistema.jsx` é um arquivo único grande.

## 11. Repositório privado `pda-express` (referência)

Não acessível aqui. Contém: sistema antigo (`legacy/`), arquivos de banco
01, 02, 03 e 05, ferramentas da migração (adaptação do código antigo, geração
da carga, regressão do motor de cálculo, testes no navegador — algumas com
trechos de dados de clientes) e documentação. As cargas `04_carga_homolog.sql`
e `04b_carga_complemento.sql` ficam fora de qualquer repositório.

## 12. Mudanças de layout e SDA (19/10/2026, pedidas pelo Julio)

Primeira "reforma" depois da mudança de casa — pedida explicitamente. O motor
de cálculo não foi tocado.

| Pedido | Como ficou | Onde |
|---|---|---|
| Nome do sistema | "Gestão de Custeio Seatrade" na aba do navegador, no login e no topo. O repositório e o endereço do site continuam `pda-express-web`. Textos dos e-mails de convite ficam no Supabase (Authentication › Email Templates), fora do código | `index.html`, `Raiz.jsx`, `sistema.jsx` |
| Coluna Ações | Botão ⋯ que abre os botões num menu suspenso (componente `Acoes`, renderizado no `body`; fecha ao escolher, clicar fora, rolar ou Esc). As 10 tabelas trocaram só a "casca" (`<div className="actions">` → `<Acoes>`); os botões e as regras de quem vê cada um são os mesmos | `sistema.jsx`, `sistema.css` |
| Pré-visualização dos PDFs | `downloads.save` abre uma janela com o PDF (iframe) e os botões Baixar/Fechar. Só **Baixar** grava no computador e responde `status: 'saved'` — portanto só ele registra a geração da FDA para o fechamento. Fechar/Esc responde `cancelled`. Arquivos que não são PDF (backup JSON) baixam direto. Se a pessoa baixar pelo botão do próprio visualizador do navegador, a geração **não** é registrada | `colecoes.js`, `sistema.css`; 3 testes |
| Cabeçalho do FDA | Na aba Escala, painel "Preencher a partir de": **Cotação (PDA)** preenche navio, viagem, porto, câmbio, medidas, quantidades e liga o FDA ao PDA (`pdaId`); se a cotação tem armador, também a Fatura e remessa. **Navio cadastrado** preenche nome e medidas e, pelo armador do navio, a Fatura e remessa. O seletor de armador na Fatura e remessa continua. Ligar um FDA manual a um PDA **não** marca a cotação como "já tem FDA" (o botão Gerar FDA continua aparecendo nela) | `sistema.jsx` (`FdaHeaderDialog`, contexto `FontesFdaCtx`) |
| SDA | Mesma tabela e mesmas telas do FDA, com `kind = 'sda'` e `parent_fda_id`. Criar: **Nova SDA avulsa** (topo da lista) ou **Gerar SDA** no ⋯ de um FDA finalizado — herda só o cabeçalho (`CAMPOS_CABECALHO`); invoice, adiantamentos e vouchers começam vazios. Etiqueta SDA nas listas e no detalhe, link para o FDA de origem, PDF com título "SUPPLEMENTARY DISBURSEMENT ACCOUNT" e arquivo "SDA - …". Banco: `database/07_sda.sql` (colunas, restrições e gatilho `trg_fda_sda`: origem precisa ser FDA finalizado; tipo não muda). O front só envia `kind`/`parent_fda_id` quando o documento tem esses campos, então FDAs continuam funcionando mesmo antes do 07 | `sistema.jsx`, `colecoes.js`, `07_sda.sql`; 4 testes |

**Conferido aqui:** `npm run build` e `npm test` (23 testes). **Não
conferido:** aparência e cliques no site (precisa de login) e o `07_sda.sql`
num PostgreSQL real — roteiro de teste na homologação depois de rodar o 07 e
publicar.

**Pontos para decidir depois:** permissões específicas para SDA (hoje usa as
mesmas do FDA: `fda_editar` etc.); se a SDA deve aparecer numa aba própria;
numeração própria de invoice para SDA.
