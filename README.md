# PDA Express — sistema web

Cotação de custos portuários (PDA) e prestação de contas (FDA) da Seatrade.

Este repositório é **público** e contém apenas o código do sistema. Nenhum dado
da empresa fica aqui: clientes, tarifas, contas e prestações vêm do banco de
dados (Supabase), somente após o login, e o banco aplica as regras de acesso
de cada perfil.

## Como funciona a publicação

A cada alteração enviada para a branch `main`, o GitHub Actions monta o
sistema e publica no GitHub Pages. As variáveis `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY` ficam nas configurações do repositório
(Settings > Secrets and variables > Actions > aba Secrets). A chave `service_role` nunca entra, nem em Secrets.

## Regras

1. Nunca incluir dados de clientes, tarifas, contas bancárias ou exportações.
2. Nunca usar a chave `service_role` / secret do Supabase neste código.
3. Testes sempre com a empresa fictícia **Empresa Teste Ltda**.
