# Gestor de Milhas (Livelo → LATAM Pass)

Sistema web pessoal para controlar compras de pontos Livelo, transferências para o LATAM Pass
(com bônus) e vendas de milhas — com custo médio ponderado por carteira e lucro das vendas.

- **Frontend:** React + TypeScript (Vite), design system Nocturne, ícones Phosphor
- **Backend:** Supabase (Postgres) — tabelas fechadas por RLS, acesso só por funções RPC
- **Hospedagem:** Vercel

## Como funciona o backend

`supabase/migrations/20260926000000_init.sql` cria:

| Tabela | Conteúdo |
| --- | --- |
| `account` | contas (nome, CPF, e-mail) |
| `operation` | lançamentos (`compra`, `compra_latam`, `transf`, `venda`) |
| `app_user` | usuário único (senha com bcrypt) |
| `app_session` | sessões (hash SHA-256 do token, expiram em 30 dias) |
| `login_attempt` | limite de 10 tentativas erradas a cada 15 min |

Nenhuma tabela é acessível diretamente pela chave pública; o app usa as funções
`gm_status`, `gm_setup`, `gm_login`, `gm_logout`, `gm_load`, `gm_save_account`,
`gm_delete_account`, `gm_save_op`, `gm_delete_op` e `gm_change_password`, que validam o token de sessão.

O **primeiro acesso** cria o usuário e senha (só é possível enquanto não houver usuário).
O sistema começa zerado. Os cálculos (custo médio, transferência, venda, validação de saldo na data)
ficam em `src/lib/calc.ts` e são refeitos do zero a cada alteração.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha com a URL e a chave publishable do Supabase
npm install
npm run dev
npm test                     # testes das regras de cálculo
```

## Variáveis de ambiente (Vercel)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (chave *publishable* / anon — é pública por natureza)

## Esqueci a senha

Não há recuperação pela tela. Para redefinir, no SQL Editor do Supabase:

```sql
update public.app_user set pass_hash = extensions.crypt('NOVA_SENHA', extensions.gen_salt('bf', 10));
delete from public.app_session;
```
