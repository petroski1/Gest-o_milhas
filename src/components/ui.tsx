import type { ReactNode } from 'react';
import { PencilSimple, Trash, WarningCircle, X } from '@phosphor-icons/react';
import { avg, type Totals } from '../lib/calc.ts';
import { money, num, plural } from '../lib/format.ts';
import { profitColor, type Row } from '../lib/rows.ts';

export function Seg<T extends string>({ name, value, options, onChange, stretch }: {
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  stretch?: boolean;
}) {
  return (
    <div className="seg" role="radiogroup" style={stretch ? { display: 'flex' } : undefined}>
      {options.map(o => (
        <label key={o.value} className={'seg-opt' + (o.value === value ? ' on' : '')} style={stretch ? { flex: 1 } : undefined}>
          <input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function ErrorLine({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="error" role="alert">
      <WarningCircle size={16} />
      {children}
    </div>
  );
}

export function Dialog({ title, onClose, children, width, top }: {
  title: string;
  onClose?: () => void;
  children: ReactNode;
  width?: number;
  top?: boolean;
}) {
  return (
    <div className={'backdrop' + (top ? ' top' : '')} onMouseDown={e => { if (onClose && e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="dialog-head">
          <div className="dialog-title">{title}</div>
          {onClose && (
            <button className="btn btn-ghost btn-icon" aria-label="Fechar" onClick={onClose} style={{ color: 'var(--color-neutral-400)' }}>
              <X size={16} />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export type ConfirmState = { title: string; body: string; yes: () => Promise<void> | void } | null;

export function Confirm({ state, busy, onNo }: { state: ConfirmState; busy: boolean; onNo: () => void }) {
  if (!state) return null;
  return (
    <Dialog title={state.title} width={400} top>
      <div className="dialog-body">{state.body}</div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onNo} disabled={busy}>Cancelar</button>
        <button className="btn btn-primary" onClick={() => state.yes()} disabled={busy}><Trash className="icon" />Excluir</button>
      </div>
    </Dialog>
  );
}

export function StatCards({ t, compact }: { t: Totals; compact?: boolean }) {
  const lcm = money(avg({ q: t.lq, c: t.lc }));
  const tcm = money(avg({ q: t.tq, c: t.tc }));
  const split = `Livelo ${money(t.lc)} · LATAM ${money(t.tc)}`;
  const profitMeta = `${plural(t.sales, 'venda', 'vendas')} · receita ${money(t.revenue)}`;
  if (compact) {
    const style = { padding: '12px 14px', gap: 2 };
    const v = { fontSize: 20, fontWeight: 500 } as const;
    return (
      <div className="grid-mini">
        <div className="card elev-sm" style={style}><div className="card-kicker">Livelo</div><div className="num" style={v}>{num(t.lq)}</div><div className="card-meta">CM {lcm} / milheiro</div></div>
        <div className="card elev-sm" style={style}><div className="card-kicker">LATAM Pass</div><div className="num" style={v}>{num(t.tq)}</div><div className="card-meta">CM {tcm} / milheiro</div></div>
        <div className="card elev-sm" style={style}><div className="card-kicker">Investido</div><div className="num" style={v}>{money(t.lc + t.tc)}</div><div className="card-meta">{split}</div></div>
        <div className="card elev-sm" style={style}><div className="card-kicker">Lucro</div><div className="num" style={{ ...v, color: profitColor(t.profit) }}>{money(t.profit)}</div><div className="card-meta">{profitMeta}</div></div>
      </div>
    );
  }
  const style = { padding: 16, gap: 6 };
  return (
    <div className="grid-stats">
      <div className="card elev-sm" style={style}><div className="card-kicker">Livelo</div><div className="card-value">{num(t.lq)}<small>pontos</small></div><div className="card-meta">Custo médio <b>{lcm}</b> / milheiro</div></div>
      <div className="card elev-sm" style={style}><div className="card-kicker">LATAM Pass</div><div className="card-value">{num(t.tq)}<small>milhas</small></div><div className="card-meta">Custo médio <b>{tcm}</b> / milheiro</div></div>
      <div className="card elev-sm" style={style}><div className="card-kicker">Total investido</div><div className="card-value">{money(t.lc + t.tc)}</div><div className="card-meta">{split}</div></div>
      <div className="card elev-sm" style={style}><div className="card-kicker">Lucro das vendas</div><div className="card-value" style={{ color: profitColor(t.profit) }}>{money(t.profit)}</div><div className="card-meta">{profitMeta}</div></div>
    </div>
  );
}

export function OpsTable({ rows, onEdit, onDelete }: { rows: Row[]; onEdit?: (r: Row) => void; onDelete?: (r: Row) => void }) {
  const actions = !!(onEdit || onDelete);
  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: actions ? 860 : 780 }}>
        <thead>
          <tr>
            <th>Data</th><th>Conta</th><th>Tipo</th>
            <th className="r">Quantidade</th><th className="r">Valor</th><th className="r">Milheiro</th><th className="r">Lucro</th>
            {actions && <th className="r">Ações</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.op.id}>
              <td className="nw">{r.date}</td>
              <td>{r.account.name}</td>
              <td>
                <div className="tags">
                  <span className={'tag ' + r.tagClass}>{r.typeLabel}</span>
                  {r.warn && <span className="tag tag-neutral">Saldo insuficiente</span>}
                </div>
              </td>
              <td className="r"><div>{r.qty}</div><div className="sub">{r.qtySub}</div></td>
              <td className="r"><div>{r.value}</div><div className="sub">{r.valueSub}</div></td>
              <td className="r"><div>{r.milheiro}</div><div className="sub">{r.milheiroSub}</div></td>
              <td className="r" style={{ color: r.resultColor }}>{r.result}</td>
              {actions && (
                <td className="r">
                  <div style={{ display: 'inline-flex', gap: 2 }}>
                    <button className="btn btn-ghost btn-icon" aria-label="Editar" title="Editar" onClick={() => onEdit?.(r)}><PencilSimple size={16} /></button>
                    <button className="btn btn-ghost btn-icon" aria-label="Excluir" title="Excluir" onClick={() => onDelete?.(r)} style={{ color: 'var(--color-neutral-400)' }}><Trash size={16} /></button>
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
