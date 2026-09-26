-- Gestor de Milhas: schema inicial
-- Acesso de usuário único (usuário + senha com bcrypt) e sessões por token.
-- As tabelas ficam fechadas por RLS; o app acessa tudo via funções RPC (security definer).

create extension if not exists pgcrypto with schema extensions;

create table public.app_user (
  id int primary key default 1 check (id = 1),
  username text not null,
  pass_hash text not null,
  created_at timestamptz not null default now()
);

create table public.app_session (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table public.login_attempt (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null
);

create table public.account (
  id text primary key,
  name text not null check (length(btrim(name)) > 0),
  cpf text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

create table public.operation (
  id text primary key,
  account_id text not null references public.account(id) on delete cascade,
  type text not null check (type in ('compra', 'compra_latam', 'transf', 'venda')),
  date date not null,
  qty numeric not null check (qty > 0),
  value numeric check (value is null or value >= 0),
  bonus numeric check (bonus is null or bonus >= 0),
  bonus_qty numeric check (bonus_qty is null or bonus_qty >= 0),
  created_at bigint not null
);
create index operation_account_id_idx on public.operation (account_id);
create index login_attempt_at_idx on public.login_attempt (at);

alter table public.app_user enable row level security;
alter table public.app_session enable row level security;
alter table public.login_attempt enable row level security;
alter table public.account enable row level security;
alter table public.operation enable row level security;
revoke all on public.app_user, public.app_session, public.login_attempt, public.account, public.operation from anon, authenticated;

-- ---------- helpers internos ----------

create function public._gm_check(p_token text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if p_token is null or not exists (
    select 1 from app_session
    where token_hash = encode(digest(p_token, 'sha256'), 'hex') and expires_at > now()
  ) then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
end $$;

create function public._gm_new_session() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(32), 'hex');
begin
  delete from app_session where expires_at < now();
  delete from login_attempt where at < now() - interval '1 day';
  insert into app_session (token_hash, expires_at)
  values (encode(digest(t, 'sha256'), 'hex'), now() + interval '30 days');
  return t;
end $$;

-- ---------- autenticação ----------

create function public.gm_status() returns jsonb
language sql security definer set search_path = public, extensions as $$
  select jsonb_build_object('hasUser', exists (select 1 from app_user));
$$;

create function public.gm_setup(p_user text, p_pass text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if exists (select 1 from app_user) then
    return jsonb_build_object('error', 'already_setup');
  end if;
  if coalesce(btrim(p_user), '') = '' or p_pass is null then
    return jsonb_build_object('error', 'missing');
  end if;
  if length(p_pass) < 6 then
    return jsonb_build_object('error', 'weak_password');
  end if;
  insert into app_user (username, pass_hash) values (lower(btrim(p_user)), crypt(p_pass, gen_salt('bf', 10)));
  return jsonb_build_object('token', _gm_new_session());
end $$;

create function public.gm_login(p_user text, p_pass text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u app_user;
begin
  if (select count(*) from login_attempt where not ok and at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('error', 'too_many_attempts');
  end if;
  select * into u from app_user where id = 1;
  if u.id is null or u.username <> lower(btrim(coalesce(p_user, ''))) or u.pass_hash <> crypt(coalesce(p_pass, ''), u.pass_hash) then
    insert into login_attempt (ok) values (false);
    return jsonb_build_object('error', 'invalid_credentials');
  end if;
  insert into login_attempt (ok) values (true);
  return jsonb_build_object('token', _gm_new_session());
end $$;

create function public.gm_logout(p_token text) returns void
language sql security definer set search_path = public, extensions as $$
  delete from app_session where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create function public.gm_change_password(p_token text, p_old text, p_new text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  if not exists (select 1 from app_user where pass_hash = crypt(coalesce(p_old, ''), pass_hash)) then
    return jsonb_build_object('error', 'invalid_credentials');
  end if;
  if length(coalesce(p_new, '')) < 6 then
    return jsonb_build_object('error', 'weak_password');
  end if;
  update app_user set pass_hash = crypt(p_new, gen_salt('bf', 10)) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- dados ----------

create function public.gm_load(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'cpf', cpf, 'email', email) order by created_at)
      from account), '[]'::jsonb),
    'ops', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', id, 'accountId', account_id, 'type', type, 'date', to_char(date, 'YYYY-MM-DD'),
        'qty', qty, 'value', value, 'bonus', bonus, 'bonusQty', bonus_qty, 'createdAt', created_at)) order by date, created_at)
      from operation), '[]'::jsonb)
  );
end $$;

create function public.gm_save_account(p_token text, p_acc jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  insert into account (id, name, cpf, email)
  values (p_acc->>'id', btrim(p_acc->>'name'), coalesce(p_acc->>'cpf', ''), coalesce(btrim(p_acc->>'email'), ''))
  on conflict (id) do update set name = excluded.name, cpf = excluded.cpf, email = excluded.email;
end $$;

create function public.gm_delete_account(p_token text, p_id text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  delete from account where id = p_id;
end $$;

create function public.gm_save_op(p_token text, p_op jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  insert into operation (id, account_id, type, date, qty, value, bonus, bonus_qty, created_at)
  values (
    p_op->>'id', p_op->>'accountId', p_op->>'type', (p_op->>'date')::date, (p_op->>'qty')::numeric,
    (p_op->>'value')::numeric, (p_op->>'bonus')::numeric, (p_op->>'bonusQty')::numeric,
    coalesce((p_op->>'createdAt')::bigint, (extract(epoch from now()) * 1000)::bigint)
  )
  on conflict (id) do update set
    account_id = excluded.account_id, type = excluded.type, date = excluded.date, qty = excluded.qty,
    value = excluded.value, bonus = excluded.bonus, bonus_qty = excluded.bonus_qty, created_at = excluded.created_at;
end $$;

create function public.gm_delete_op(p_token text, p_id text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform _gm_check(p_token);
  delete from operation where id = p_id;
end $$;

-- ---------- permissões ----------

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.gm_status(), public.gm_setup(text, text), public.gm_login(text, text), public.gm_logout(text),
  public.gm_change_password(text, text, text), public.gm_load(text),
  public.gm_save_account(text, jsonb), public.gm_delete_account(text, text),
  public.gm_save_op(text, jsonb), public.gm_delete_op(text, text)
to anon, authenticated;
