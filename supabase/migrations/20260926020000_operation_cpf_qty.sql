-- Quantidade de CPFs (passageiros) emitidos em cada venda — limite de 24 por conta LATAM por ano.
alter table public.operation add column cpf_qty int check (cpf_qty is null or cpf_qty >= 0);

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
        'id', id, 'accountId', account_id, 'type', type, 'date', to_char(date, 'YYYY-MM-DD'),
        'qty', qty, 'value', value, 'bonus', bonus, 'bonusQty', bonus_qty, 'cpfQty', cpf_qty,
        'createdAt', created_at)) order by date, created_at)
      from operation), '[]'::jsonb)
  );
end $$;

create or replace function public.gm_save_op(p_token text, p_op jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  insert into operation (id, account_id, type, date, qty, value, bonus, bonus_qty, cpf_qty, created_at)
  values (
    p_op->>'id', p_op->>'accountId', p_op->>'type', (p_op->>'date')::date, (p_op->>'qty')::numeric,
    (p_op->>'value')::numeric, (p_op->>'bonus')::numeric, (p_op->>'bonusQty')::numeric, (p_op->>'cpfQty')::int,
    coalesce((p_op->>'createdAt')::bigint, (extract(epoch from now()) * 1000)::bigint)
  )
  on conflict (id) do update set
    account_id = excluded.account_id, type = excluded.type, date = excluded.date, qty = excluded.qty,
    value = excluded.value, bonus = excluded.bonus, bonus_qty = excluded.bonus_qty, cpf_qty = excluded.cpf_qty,
    created_at = excluded.created_at;
end $$;
