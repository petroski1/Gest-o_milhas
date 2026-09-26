-- Senha da conta no programa (Livelo/LATAM), exibida em texto no app.
alter table public.account add column password text not null default '';

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
        'qty', qty, 'value', value, 'bonus', bonus, 'bonusQty', bonus_qty, 'createdAt', created_at)) order by date, created_at)
      from operation), '[]'::jsonb)
  );
end $$;

create or replace function public.gm_save_account(p_token text, p_acc jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  insert into account (id, name, cpf, email, password)
  values (p_acc->>'id', btrim(p_acc->>'name'), coalesce(p_acc->>'cpf', ''), coalesce(btrim(p_acc->>'email'), ''), coalesce(p_acc->>'password', ''))
  on conflict (id) do update set name = excluded.name, cpf = excluded.cpf, email = excluded.email, password = excluded.password;
end $$;
