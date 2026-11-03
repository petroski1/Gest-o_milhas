-- Transferência de pontos entre contas Livelo (transf_livelo).
-- A operação fica na conta de origem (account_id) e aponta para a conta de destino (to_account_id).
-- Os pontos saem pelo custo médio da origem e entram no destino com esse custo (+ taxa opcional em value).
alter table public.operation drop constraint if exists operation_type_check;
alter table public.operation add constraint operation_type_check
  check (type in ('compra', 'compra_latam', 'transf', 'transf_livelo', 'venda'));

alter table public.operation add column to_account_id text references public.account(id) on delete cascade;
alter table public.operation add constraint operation_to_account_check check (
  (type = 'transf_livelo') = (to_account_id is not null) and to_account_id is distinct from account_id
);
create index operation_to_account_id_idx on public.operation (to_account_id);

create or replace function public.gm_load(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'cpf', cpf, 'email', email, 'password', password) order by created_at)
      from account), '[]'::jsonb),
    'ops', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', id, 'accountId', account_id, 'toAccountId', to_account_id, 'type', type, 'date', to_char(date, 'YYYY-MM-DD'),
        'qty', qty, 'value', value, 'bonus', bonus, 'bonusQty', bonus_qty, 'cpfQty', cpf_qty,
        'createdAt', created_at)) order by date, created_at)
      from operation), '[]'::jsonb)
  );
end $$;

create or replace function public.gm_save_op(p_token text, p_op jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  insert into operation (id, account_id, to_account_id, type, date, qty, value, bonus, bonus_qty, cpf_qty, created_at)
  values (
    p_op->>'id', p_op->>'accountId', nullif(p_op->>'toAccountId', ''), p_op->>'type', (p_op->>'date')::date, (p_op->>'qty')::numeric,
    (p_op->>'value')::numeric, (p_op->>'bonus')::numeric, (p_op->>'bonusQty')::numeric, (p_op->>'cpfQty')::int,
    coalesce((p_op->>'createdAt')::bigint, (extract(epoch from now()) * 1000)::bigint)
  )
  on conflict (id) do update set
    account_id = excluded.account_id, to_account_id = excluded.to_account_id, type = excluded.type, date = excluded.date,
    qty = excluded.qty, value = excluded.value, bonus = excluded.bonus, bonus_qty = excluded.bonus_qty,
    cpf_qty = excluded.cpf_qty, created_at = excluded.created_at;
end $$;
