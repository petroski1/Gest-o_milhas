import { useCallback, useEffect, useMemo, useState } from 'react';
import { AirplaneTilt, Plus, SignOut, WarningCircle } from '@phosphor-icons/react';
import { AccModal } from './components/AccModal.tsx';
import { Login } from './components/Login.tsx';
import { OpModal, draftFromOp, type OpDraft } from './components/OpModal.tsx';
import { Confirm, type ConfirmState } from './components/ui.tsx';
import { Contas, Dashboard, Historico, type HistType } from './components/Views.tsx';
import { api, AuthError, configured, session } from './lib/api.ts';
import { replay, type Replay } from './lib/calc.ts';
import { dt, num, today, uid } from './lib/format.ts';
import { buildRow, type Row } from './lib/rows.ts';
import type { Account, Data, Operation, OpType } from './lib/types.ts';

type Auth = 'loading' | 'setup' | 'login' | 'ok' | 'offline';
type View = 'dash' | 'contas' | 'hist';
const EMPTY: Data = { accounts: [], ops: [] };

export default function App() {
  const [auth, setAuth] = useState<Auth>('loading');
  const [data, setData] = useState<Data>(EMPTY);
  const [view, setView] = useState<View>('dash');
  const [dashFilter, setDashFilter] = useState('all');
  const [histAccount, setHistAccount] = useState('all');
  const [histType, setHistType] = useState<HistType>('all');
  const [contasQuery, setContasQuery] = useState('');
  const [contasMode, setContasMode] = useState<'ambas' | 'livelo' | 'latam'>('ambas');
  const [op, setOp] = useState<OpDraft | null>(null);
  const [acc, setAcc] = useState<Account | null | undefined>(undefined); // undefined = fechado, null = nova
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(t => (t === m ? '' : t)), 4000);
  }, []);

  const resetUi = () => { setOp(null); setAcc(undefined); setConfirm(null); setConfirmBusy(false); };

  const toLogin = useCallback(async () => {
    setData(EMPTY);
    resetUi();
    try {
      const s = await api.status();
      setAuth(s.hasUser ? 'login' : 'setup');
    } catch {
      setAuth('offline');
    }
  }, []);

  const handleError = useCallback((e: unknown) => {
    if (e instanceof AuthError) {
      showToast(e.message);
      toLogin();
    }
    throw e;
  }, [showToast, toLogin]);

  useEffect(() => {
    if (!configured) { setAuth('offline'); return; }
    (async () => {
      if (session.get()) {
        try {
          setData(await api.load());
          setAuth('ok');
          return;
        } catch { session.clear(); }
      }
      toLogin();
    })();
  }, [toLogin]);

  async function submitAuth(user: string, pass: string) {
    if (auth === 'setup') await api.setup(user, pass);
    else await api.login(user, pass);
    setData(await api.load());
    setView('dash');
    setAuth('ok');
  }

  async function logout() {
    await api.logout();
    toLogin();
  }

  // ---- cálculos derivados ----
  const accById = useMemo(() => Object.fromEntries(data.accounts.map(a => [a.id, a])), [data.accounts]);
  const reps = useMemo(() => {
    const r: Record<string, Replay> = {};
    for (const a of data.accounts) r[a.id] = replay(data.ops.filter(o => o.accountId === a.id));
    return r;
  }, [data]);
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const o of data.ops) {
      const a = accById[o.accountId];
      if (a) out.push(buildRow(o, reps[a.id].rows[o.id] || {}, a));
    }
    return out.sort((x, y) => (x.sortKey < y.sortKey ? 1 : x.sortKey > y.sortKey ? -1 : 0));
  }, [data.ops, accById, reps]);

  // ---- ações ----
  function openNewOp(accountId?: string, type?: OpType) {
    if (!data.accounts.length) { setAcc(null); return; }
    const ctx = accountId
      || (view === 'hist' && histAccount !== 'all' ? histAccount : dashFilter !== 'all' ? dashFilter : data.accounts[0].id);
    setOp({ accountId: ctx, type: type || 'compra', date: today(), qty: '', value: '', bonus: '25', bonusQty: '', cpfQty: '', createdAt: Date.now() });
  }

  async function saveOp(o: Operation) {
    const rec = { ...o, id: o.id || uid('op_') };
    await api.saveOp(rec).catch(handleError);
    setData(d => ({ ...d, ops: d.ops.some(x => x.id === rec.id) ? d.ops.map(x => (x.id === rec.id ? rec : x)) : [...d.ops, rec] }));
    setOp(null);
  }

  async function saveAcc(a: Account) {
    const rec = { ...a, id: a.id || uid('acc_') };
    await api.saveAccount(rec).catch(handleError);
    setData(d => ({ ...d, accounts: d.accounts.some(x => x.id === rec.id) ? d.accounts.map(x => (x.id === rec.id ? rec : x)) : [...d.accounts, rec] }));
    setAcc(undefined);
  }

  async function runConfirm(fn: () => Promise<void>) {
    setConfirmBusy(true);
    try {
      await fn();
      setConfirm(null);
    } catch (e) {
      if (!(e instanceof AuthError)) showToast((e as Error).message || 'Não foi possível excluir.');
    } finally {
      setConfirmBusy(false);
    }
  }

  function askDeleteOp(r: Row) {
    const labels: Record<OpType, string> = { compra: 'compra', compra_latam: 'compra', transf: 'transferência', venda: 'venda' };
    const o = r.op;
    setConfirm({
      title: 'Excluir lançamento',
      body: `A ${labels[o.type]} de ${dt(o.date)} (${num(o.qty)}) da conta ${r.account.name} será removida e os custos médios serão recalculados.`,
      yes: () => runConfirm(async () => {
        await api.deleteOp(o.id).catch(handleError);
        setData(d => ({ ...d, ops: d.ops.filter(x => x.id !== o.id) }));
      }),
    });
  }

  function askDeleteAcc(a: Account) {
    const n = data.ops.filter(o => o.accountId === a.id).length;
    setConfirm({
      title: 'Excluir conta',
      body: `A conta ${a.name} e ${plural(n)} serão removidos permanentemente.`,
      yes: () => runConfirm(async () => {
        await api.deleteAccount(a.id).catch(handleError);
        setData(d => ({ accounts: d.accounts.filter(x => x.id !== a.id), ops: d.ops.filter(o => o.accountId !== a.id) }));
        setAcc(undefined);
        if (histAccount === a.id) setHistAccount('all');
        if (dashFilter === a.id) setDashFilter('all');
      }),
    });
  }
  const plural = (n: number) => (n === 1 ? 'seu 1 lançamento' : `seus ${n} lançamentos`);

  const extrato = (id: string) => { setView('hist'); setHistAccount(id); setHistType('all'); };

  // ---- render ----
  let body;
  if (auth === 'loading') {
    body = <div className="login-wrap"><div className="muted">Carregando…</div></div>;
  } else if (auth === 'offline') {
    body = (
      <div className="login-wrap">
        <div className="card elev-md login">
          <div className="error"><WarningCircle size={16} />{configured ? 'Não foi possível conectar ao servidor.' : 'Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).'}</div>
          {configured && <button className="btn btn-primary btn-block" onClick={() => { setAuth('loading'); toLogin(); }}>Tentar novamente</button>}
        </div>
      </div>
    );
  } else if (auth !== 'ok') {
    body = <Login key={auth} setup={auth === 'setup'} onSubmit={submitAuth} />;
  } else {
    const tab = (v: View, label: string) => (
      <button className={'tab' + (view === v ? ' on' : '')} onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined}>{label}</button>
    );
    body = (
      <>
        <header className="header">
          <div className="header-row">
            <div className="brand">
              <span className="brand-icon"><AirplaneTilt size={18} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="brand-title">Gestor de Milhas</div>
                <div className="brand-sub">Livelo → LATAM Pass</div>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => openNewOp()} aria-label="Nova operação"><Plus className="icon" /><span className="label">Nova operação</span></button>
            <button className="btn btn-ghost btn-icon" aria-label="Sair" title="Sair" onClick={logout} style={{ color: 'var(--color-neutral-400)' }}><SignOut size={17} /></button>
          </div>
          <nav className="tabs">{tab('dash', 'Dashboard')}{tab('contas', 'Contas')}{tab('hist', 'Histórico')}</nav>
        </header>
        <main className="main">
          {view === 'dash' && (
            <Dashboard accounts={data.accounts} reps={reps} rows={rows} filter={dashFilter} setFilter={setDashFilter}
              goHist={() => { setView('hist'); setHistAccount(dashFilter); setHistType('all'); }} />
          )}
          {view === 'contas' && (
            <Contas accounts={data.accounts} reps={reps} query={contasQuery} setQuery={setContasQuery} mode={contasMode} setMode={setContasMode}
              onNewAcc={() => setAcc(null)} onEditAcc={a => setAcc(a)} onOp={openNewOp} onExtrato={extrato} />
          )}
          {view === 'hist' && (
            <Historico accounts={data.accounts} reps={reps} rows={rows} account={histAccount} setAccount={setHistAccount} type={histType} setType={setHistType}
              onEditAcc={a => setAcc(a)} onNewOp={id => openNewOp(id)} onEdit={r => setOp(draftFromOp(r.op))} onDelete={askDeleteOp} />
          )}
        </main>
        {op && <OpModal initial={op} data={data} onClose={() => setOp(null)} onSave={saveOp} />}
        {acc !== undefined && <AccModal key={acc?.id || 'new'} initial={acc} onClose={() => setAcc(undefined)} onSave={saveAcc} onDelete={askDeleteAcc} />}
        <Confirm state={confirm} busy={confirmBusy} onNo={() => setConfirm(null)} />
      </>
    );
  }

  return (
    <div className="app">
      {body}
      {toast && <div className="toast" role="status"><WarningCircle size={16} />{toast}</div>}
    </div>
  );
}
