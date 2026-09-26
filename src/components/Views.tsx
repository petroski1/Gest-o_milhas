import { ArrowRight, ListBullets, MagnifyingGlass, Minus, PencilSimple, Plus, UserPlus } from '@phosphor-icons/react';
import { avg, CPF_LIMIT, cpfStatusAt, totals, type Replay } from '../lib/calc.ts';
import { dec, dt, money, num, plural, today } from '../lib/format.ts';
import type { Row } from '../lib/rows.ts';
import type { Account, OpType } from '../lib/types.ts';
import { OpsTable, Seg, StatCards } from './ui.tsx';

type Reps = Record<string, Replay>;

function AccountSelect({ id, label, value, accounts, onChange, width }: {
  id: string; label: string; value: string; accounts: Account[]; onChange: (v: string) => void; width: number;
}) {
  return (
    <div className="field" style={{ width: `min(${width}px, 100%)` }}>
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="all">Todas as contas</option>
        {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  );
}

export function Dashboard({ accounts, reps, rows, filter, setFilter, goHist }: {
  accounts: Account[]; reps: Reps; rows: Row[]; filter: string; setFilter: (v: string) => void; goHist: () => void;
}) {
  const ids = filter === 'all' ? accounts.map(a => a.id) : [filter];
  const recent = rows.filter(r => ids.includes(r.account.id)).slice(0, 8);
  const sub = filter === 'all' ? `Consolidado de ${plural(accounts.length, 'conta', 'contas')}` : accounts.find(a => a.id === filter)?.name;
  return (
    <section className="section">
      <div className="page-head">
        <div><h1>Dashboard</h1><div className="page-sub">{sub}</div></div>
        <AccountSelect id="dash-filter" label="Filtrar" value={filter} accounts={accounts} onChange={setFilter} width={260} />
      </div>
      <StatCards t={totals(ids.map(id => reps[id]))} />
      <div className="card elev-sm" style={{ padding: 16, gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className="card-title">Últimas operações</div>
          <button className="btn btn-ghost" onClick={goHist}>Ver histórico <ArrowRight className="icon" /></button>
        </div>
        {recent.length ? <OpsTable rows={recent} /> : <div className="empty">Nenhuma operação registrada.</div>}
      </div>
    </section>
  );
}

type Mode = 'ambas' | 'livelo' | 'latam';

export const cpfText = (rep: Replay) => {
  const st = cpfStatusAt(rep.cpfEmissions, today());
  return `CPFs: ${st.used} de ${CPF_LIMIT} em uso` + (st.next ? ` · +${st.next.qty} em ${dt(st.next.date)}` : '');
};

function CpfMeter({ rep }: { rep: Replay }) {
  const st = cpfStatusAt(rep.cpfEmissions, today());
  const pct = Math.min(st.used / CPF_LIMIT, 1) * 100;
  const full = st.free === 0;
  return (
    <div className="cpf-meter" title={`Cada emissão libera seus CPFs 12 meses depois (limite ${CPF_LIMIT} em uso)`}>
      <div className="cpf-meter-row">
        <span>CPFs {full ? '· limite atingido' : `· disponíveis ${st.free}`}</span>
        <span className="num" style={{ color: full ? 'var(--color-accent-300)' : 'var(--color-text)' }}>{st.used} / {CPF_LIMIT}</span>
      </div>
      <div className="cpf-bar"><div style={{ width: `${pct}%` }} /></div>
      <div className="cpf-meter-row"><span>{st.next ? `Libera +${st.next.qty} em ${dt(st.next.date)}` : 'Nenhum CPF em uso'}</span></div>
    </div>
  );
}

function WalletCard({ account, rep, prog, onOp, onExtrato }: {
  account: Account; rep: Replay; prog: 'livelo' | 'latam'; onOp: (id: string, t: OpType) => void; onExtrato: (id: string) => void;
}) {
  const w = prog === 'livelo' ? rep.L : rep.T;
  return (
    <div className="card elev-sm wallet">
      <div className="wallet-top">
        <span className="tag tag-neutral" title={account.name}>{account.name}</span>
        <span className="wallet-prog">{prog === 'livelo' ? 'Livelo' : 'LATAM Pass'}</span>
      </div>
      <div className="wallet-logo">
        {prog === 'livelo'
          ? <span className="logo-livelo">livelo</span>
          : <div className="logo-latam"><span>LATAM</span><strong>PASS</strong></div>}
      </div>
      <div className="wallet-cols">
        <div className="h">Milhas</div><div className="h">CM</div><div className="h">R$</div>
        <div className="fade-line" />
        <div className="v">{num(w.q)}</div><div className="v">{dec(avg(w))}</div><div className="v">{dec(w.c)}</div>
      </div>
      {prog === 'latam' && <CpfMeter rep={rep} />}
      <div className="wallet-actions">
        <button className="btn btn-primary btn-sm" onClick={() => onOp(account.id, prog === 'livelo' ? 'compra' : 'compra_latam')}><Plus />Comprar</button>
        <button className="btn btn-secondary btn-sm" onClick={() => onOp(account.id, prog === 'livelo' ? 'transf' : 'venda')}><Minus />{prog === 'livelo' ? 'Transferir' : 'Vender'}</button>
        <button className="btn btn-ghost btn-icon btn-sm push" aria-label="Extrato" title="Extrato" onClick={() => onExtrato(account.id)}><ListBullets size={15} /></button>
      </div>
    </div>
  );
}

export function Contas({ accounts, reps, query, setQuery, mode, setMode, onNewAcc, onEditAcc, onOp, onExtrato }: {
  accounts: Account[]; reps: Reps; query: string; setQuery: (v: string) => void; mode: Mode; setMode: (m: Mode) => void;
  onNewAcc: () => void; onEditAcc: (a: Account) => void; onOp: (id: string, t: OpType) => void; onExtrato: (id: string) => void;
}) {
  const q = query.trim().toLowerCase();
  const qd = q.replace(/\D/g, '');
  const list = accounts
    .filter(a => !q || a.name.toLowerCase().includes(q) || (a.cpf || '').includes(q) || (!!qd && (a.cpf || '').replace(/\D/g, '').includes(qd)))
    .sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
  const pat = accounts.reduce((s, a) => s + reps[a.id].L.c + reps[a.id].T.c, 0);
  return (
    <section className="section" style={{ gap: 18 }}>
      <div className="page-head">
        <div><h1>Contas</h1><div className="page-sub">{plural(accounts.length, 'conta', 'contas')} · patrimônio {money(pat)}</div></div>
        <button className="btn btn-secondary" onClick={onNewAcc}><UserPlus className="icon" />Adicionar conta</button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative', width: 'min(260px, 100%)' }}>
          <MagnifyingGlass size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-neutral-500)', pointerEvents: 'none' }} />
          <input className="input" aria-label="Buscar conta" placeholder="Buscar conta" value={query} onChange={e => setQuery(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <Seg name="cmode" value={mode} onChange={setMode} options={[
          { value: 'ambas', label: 'Livelo + LATAM' }, { value: 'livelo', label: 'Livelo' }, { value: 'latam', label: 'LATAM' },
        ]} />
      </div>
      {!accounts.length && (
        <div className="card elev-sm" style={{ padding: 24, gap: 8, alignItems: 'flex-start' }}>
          <div className="card-title">Nenhuma conta cadastrada</div>
          <p className="muted" style={{ margin: 0 }}>Cadastre uma conta para registrar compras, transferências e vendas.</p>
          <button className="btn btn-primary" onClick={onNewAcc}><Plus className="icon" />Adicionar conta</button>
        </div>
      )}
      {accounts.length > 0 && !list.length && <div className="empty" style={{ padding: '16px 0' }}>Nenhuma conta encontrada.</div>}
      {mode === 'ambas' ? (
        <div className="grid-groups">
          {list.map(a => (
            <div key={a.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <div className="grid-pair">
                <WalletCard account={a} rep={reps[a.id]} prog="livelo" onOp={onOp} onExtrato={onExtrato} />
                <WalletCard account={a} rep={reps[a.id]} prog="latam" onOp={onOp} onExtrato={onExtrato} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span className="tag tag-outline num" style={{ fontSize: 13, fontWeight: 500, padding: '4px 10px' }}>Patrimônio total: {money(reps[a.id].L.c + reps[a.id].T.c)}</span>
                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--color-neutral-400)' }} aria-label="Editar conta" title="Editar conta" onClick={() => onEditAcc(a)}><PencilSimple size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid-wallets">
          {list.map(a => <WalletCard key={a.id} account={a} rep={reps[a.id]} prog={mode} onOp={onOp} onExtrato={onExtrato} />)}
        </div>
      )}
    </section>
  );
}

export type HistType = 'all' | 'compra' | 'transf' | 'venda';

export function Historico({ accounts, reps, rows, account, setAccount, type, setType, onEditAcc, onNewOp, onEdit, onDelete }: {
  accounts: Account[]; reps: Reps; rows: Row[]; account: string; setAccount: (v: string) => void; type: HistType; setType: (t: HistType) => void;
  onEditAcc: (a: Account) => void; onNewOp: (id: string) => void; onEdit: (r: Row) => void; onDelete: (r: Row) => void;
}) {
  const list = rows.filter(r =>
    (account === 'all' || r.account.id === account) &&
    (type === 'all' || r.op.type === type || (type === 'compra' && r.op.type === 'compra_latam')));
  const a = accounts.find(x => x.id === account);
  return (
    <section className="section">
      <div className="page-head">
        <div><h1>Histórico</h1><div className="page-sub">{plural(list.length, 'lançamento', 'lançamentos')}</div></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <AccountSelect id="hist-acc" label="Conta" value={account} accounts={accounts} onChange={setAccount} width={240} />
          <Seg name="htype" value={type} onChange={setType} options={[
            { value: 'all', label: 'Todas' }, { value: 'compra', label: 'Compras' }, { value: 'transf', label: 'Transferências' }, { value: 'venda', label: 'Vendas' },
          ]} />
        </div>
      </div>
      {a && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 500 }}>{a.name}</div>
              <div className="muted" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{[a.cpf, a.email, a.password && `Senha: ${a.password}`].filter(Boolean).join(' · ') || 'Sem CPF e e-mail'}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => onEditAcc(a)}><PencilSimple className="icon" />Editar conta</button>
              <button className="btn btn-secondary" onClick={() => onNewOp(a.id)}><Plus className="icon" />Operação</button>
            </div>
          </div>
          <StatCards t={totals([reps[a.id]])} compact cpf={cpfText(reps[a.id])} />
        </div>
      )}
      <div className="card elev-sm" style={{ padding: 16, gap: 10 }}>
        <div className="card-title">Extrato</div>
        {list.length ? <OpsTable rows={list} onEdit={onEdit} onDelete={onDelete} /> : <div className="empty">Nenhum lançamento encontrado.</div>}
      </div>
    </section>
  );
}
