# PDA Express — instruções para o Claude Code

Leia este arquivo e `docs/CONTEXTO.md` antes de qualquer alteração. O contexto
traz a história, o estado atual, os testes já feitos e o que falta.

## Quem é o usuário

Julio, da área de operações portuárias. Ele não é programador. Por isso:

- Escreva sempre em português, em linguagem simples, com passos numerados e
  dizendo **onde** clicar (GitHub, Supabase, site).
- Antes de cada `git push`, mostre o que mudou em poucas linhas e **peça
  confirmação**. Todo envio para a `main` publica o site na hora.
- Quando algo der errado, inclusive por erro seu, diga com clareza o que foi,
  corrija e registre em `docs/CONTEXTO.md` (seção "Erros e correções").

## O que é o sistema

Cotação de custos portuários (PDA) e prestação de contas (FDA) de uma agência
marítima. Front-end React + Vite publicado no GitHub Pages; banco, login e
arquivos no Supabase. Não há servidor próprio: **quem decide o que cada perfil
pode fazer é o banco** (RLS e gatilhos), nunca o navegador.

## Regras sem exceção

1. **Este repositório é público.** Nada de dados reais: nomes de clientes,
   armadores, navios reais, bancos, contas, CNPJ, endereços, tarifas, valores
   de prestações, exportações ou cargas de dados. Isso vale também para textos
   de exemplo (`placeholder`), comentários, testes e mensagens de commit.
   Antes de cada commit, rode a busca da seção "Conferências".
2. Nunca use, peça ou grave a chave `service_role` / secret do Supabase. O site
   usa só a chave pública (anon), que fica em Settings › Secrets and variables ›
   Actions › aba **Secrets** (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Nunca peça ao Julio que cole senha, token ou chave na conversa.
4. Testes sempre com dados fictícios: **Empresa Teste Ltda**, **NAVIO TESTE**.
   No site de homologação, testes manuais só na prestação NAVIO TESTE.
5. Arquivos de carga ou exportação (`*carga*.sql`, `*export*.json`) nunca entram
   em nenhum repositório. O `.gitignore` bloqueia, mas confira.
6. **Mudar de casa primeiro, reformar depois:** `src/legacy/sistema.jsx` é o
   sistema antigo levado inteiro. Não refatore nem "melhore" o que não foi
   pedido; o motor de cálculo (`calculate`) não muda sem teste de regressão.

## Mudanças no banco

As regras de segurança (arquivos 01, 02 e 03) estão no repositório privado
`pda-express`, que **não** está disponível aqui. Por isso:

- Não presuma regras do banco: quando o comportamento depender delas, diga
  isso e proponha um teste no site de homologação.
- Mudança de estrutura vira um arquivo novo `database/10_...sql` (o próximo
  número livre), para o Julio
  rodar no SQL Editor do Supabase. O arquivo deve: estar entre `begin;` e
  `commit;`, poder ser rodado de novo sem duplicar nada, não conter dados de
  clientes e, se desligar algum gatilho, religá-lo no mesmo arquivo.
- Explique em que ordem rodar e uma consulta de conferência com o resultado
  esperado.

## Estrutura

| Caminho | Papel |
|---|---|
| `src/main.jsx` | Entrada; aplica o tema salvo; expõe `window.PDFLib` |
| `src/supabase.js` | Conexão; tradução de mensagens de erro de login |
| `src/plataforma/Raiz.jsx` | Login, definição de senha (convite/recuperação), liberação de acesso, carga inicial; monta `window.__PDX__` (usuário, perfil, permissões) |
| `src/plataforma/cadastros.js` | Cadastros e cotações: lê tudo na abertura, `store.get/set` com a mesma interface do sistema antigo, grava no Supabase só o item que mudou; mapeia ids antigos ↔ uuid; plano de contas (`contas`) |
| `src/plataforma/colecoes.js` | Prestações (FDA), vouchers, despesas, adiantamentos, PDFs gerados, comprovantes (Storage), downloads; imita a API `window.claude.use('db' / 'assets' / 'downloads' / 'user')` que o sistema antigo usava; fila por documento; recarga a cada 30 s |
| `src/legacy/sistema.jsx` / `.css` | Sistema antigo adaptado (≈ 360 KB, um arquivo só) |
| `database/05_ajustes_web.sql` | Ajuste de banco para a versão web (sem dados) |
| `database/06_comprovantes_removidos.sql` | Visão `comprovante_removido` (comprovantes apagados em cascata, lidos da auditoria) |
| `database/07_sda.sql` | SDA: colunas `kind` e `parent_fda_id` em `fda`, gatilho `trg_fda_sda` |
| `database/08_navio_armador_opcional.sql` | Armador do navio opcional (o armador é por escala) |
| `database/09_dupla_validacao_so_operacional.sql` | Segregação na validação de voucher só para quem não é financeiro nem admin (função `fn_voucher_sod`) |
| `testes/` | `npm test`: testes da camada de gravação com banco falso em memória |
| `.github/workflows/publicar.yml` | Build e publicação no Pages a cada push na `main` |

## Comandos

```
npm ci
npm run build      # precisa de VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY (valores falsos bastam para compilar)
npm test           # 24 testes; todos devem passar
npm run dev        # local; com .env apontando para a homologação
```

Para compilar sem `.env`:
`VITE_SUPABASE_URL=https://x.supabase.co VITE_SUPABASE_ANON_KEY=k npm run build`

No computador do Julio (Windows, PowerShell, sem Git; Node portátil): copiar
para fora do OneDrive e compilar lá.

```
$env:Path = "$env:LOCALAPPDATA\node-portable\node-v20.18.0-win-x64;$env:Path"
robocopy "<pasta do projeto no OneDrive>" "$env:USERPROFILE\pdx-build" /MIR /XD node_modules dist
cd "$env:USERPROFILE\pdx-build"; npm ci   # só na primeira vez ou se o package-lock mudar
$env:VITE_SUPABASE_URL='https://x.supabase.co'; $env:VITE_SUPABASE_ANON_KEY='k'
npm run build; npm test
```

## Método de trabalho

- Substituições exatas e pequenas, conferindo quantas vezes o trecho aparece
  antes de trocar (no `sistema.jsx` há trechos repetidos).
- Depois de cada alteração: `npm run build` e `npm test`.
- Para cada erro corrigido em `colecoes.js` ou `cadastros.js`, acrescente um
  teste em `testes/colecoes.test.mjs` e confira que ele **falha** com o código
  antigo e passa com o novo.
- O que depende do banco real (permissões, gatilhos, Storage, e-mail) só se
  confirma no site: entregue ao Julio um roteiro curto, um teste por vez,
  dizendo o resultado esperado e o que observar.
- Atualize `docs/CONTEXTO.md` ao fim de cada sessão de trabalho.

## Conferências antes de cada commit

```
npm run build && npm test
git diff --cached | grep -inE "service_role|eyJhbGci|sk_live|password *=|senha *="
```

E confira, lendo o `git diff --cached`, que não entrou nenhum nome real de
cliente, navio, banco ou valor de prestação (a lista de nomes a evitar está no
registro privado do Julio; na dúvida, pergunte).
