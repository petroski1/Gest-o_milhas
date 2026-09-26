import { createClient } from '@supabase/supabase-js';
import type { Account, Data, Operation } from './types.ts';

// Valores públicos do projeto Supabase (a chave publishable vai no navegador de qualquer forma).
// Variáveis VITE_SUPABASE_* não vazias têm prioridade.
const DEFAULT_URL = 'https://ahfrojfhttvpqjgobrqb.supabase.co';
const DEFAULT_KEY = 'sb_publishable_8tg9NZnzAgTZBnmFgZ1RNg_GW8R0EZQ';
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || DEFAULT_URL;
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || DEFAULT_KEY;

export const configured = !!(url && key);

const sb = configured
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;

const SESS = 'gestor-milhas-session';

export class AuthError extends Error {}

export const session = {
  get: () => {
    try { return sessionStorage.getItem(SESS); } catch { return null; }
  },
  set: (t: string) => {
    try { sessionStorage.setItem(SESS, t); } catch { /* sem storage */ }
  },
  clear: () => {
    try { sessionStorage.removeItem(SESS); } catch { /* sem storage */ }
  },
};

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!sb) throw new Error('Supabase não configurado.');
  const { data, error } = await sb.rpc(fn, args);
  if (error) {
    if (error.code === '28000' || error.message === 'not_authenticated') {
      session.clear();
      throw new AuthError('Sessão expirada. Entre novamente.');
    }
    throw new Error(error.message);
  }
  return data as T;
}

const token = () => session.get();

type AuthResult = { token?: string; error?: string };

const authMessages: Record<string, string> = {
  invalid_credentials: 'Usuário ou senha incorretos.',
  too_many_attempts: 'Muitas tentativas. Aguarde 15 minutos.',
  weak_password: 'A senha precisa ter pelo menos 6 caracteres.',
  already_setup: 'O acesso já foi criado. Entre com seu usuário e senha.',
  missing: 'Informe usuário e senha.',
};

async function auth(fn: string, user: string, pass: string) {
  const r = await rpc<AuthResult>(fn, { p_user: user, p_pass: pass });
  if (r.error || !r.token) throw new Error(authMessages[r.error || ''] || 'Não foi possível acessar.');
  session.set(r.token);
}

export const api = {
  status: () => rpc<{ hasUser: boolean }>('gm_status'),
  setup: (user: string, pass: string) => auth('gm_setup', user, pass),
  login: (user: string, pass: string) => auth('gm_login', user, pass),
  logout: async () => {
    const t = token();
    session.clear();
    if (t) await rpc('gm_logout', { p_token: t }).catch(() => {});
  },
  load: async (): Promise<Data> => {
    const d = await rpc<{ accounts: Account[]; ops: Operation[] }>('gm_load', { p_token: token() });
    return {
      accounts: (d.accounts || []).map(a => ({ ...a, password: a.password || '' })),
      ops: (d.ops || []).map(o => ({ ...o, qty: +o.qty, value: o.value != null ? +o.value : undefined, bonus: o.bonus != null ? +o.bonus : undefined, bonusQty: o.bonusQty != null ? +o.bonusQty : undefined, cpfQty: o.cpfQty != null ? +o.cpfQty : undefined, createdAt: +o.createdAt })),
    };
  },
  saveAccount: (a: Account) => rpc<void>('gm_save_account', { p_token: token(), p_acc: a }),
  deleteAccount: (id: string) => rpc<void>('gm_delete_account', { p_token: token(), p_id: id }),
  saveOp: (o: Operation) => rpc<void>('gm_save_op', { p_token: token(), p_op: o }),
  deleteOp: (id: string) => rpc<void>('gm_delete_op', { p_token: token(), p_id: id }),
  changePassword: async (oldPass: string, newPass: string) => {
    const r = await rpc<{ ok?: boolean; error?: string }>('gm_change_password', { p_token: token(), p_old: oldPass, p_new: newPass });
    if (r.error) throw new Error(r.error === 'invalid_credentials' ? 'Senha atual incorreta.' : authMessages[r.error] || 'Não foi possível alterar.');
  },
};
