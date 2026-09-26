import { useState } from 'react';
import { Check } from '@phosphor-icons/react';
import { CPF_LIMIT, replay } from '../lib/calc.ts';
import { dec, dt, maskQty, money, num, parseBR, parsePct } from '../lib/format.ts';
import { profitColor } from '../lib/rows.ts';
import type { Data, Operation, OpType } from '../lib/types.ts';
import { Dialog, ErrorLine, Seg } from './ui.tsx';

export type OpDraft = {
  id?: string;
  accountId: string;
  type: OpType;
  date: string;
  qty: string;
  value: string;
  bonus: string;
  bonusQty: string;
  cpfQty: string;
  createdAt: number;
};

export const draftFromOp = (o: Operation): OpDraft => ({
  id: o.id,
  accountId: o.accountId,
  type: o.type,
  date: o.date,
  qty: num(o.qty),
  value: o.value != null ? dec(o.value) : '',
  bonus: o.type === 'transf' && o.bonus != null ? String(o.bonus).replace('.', ',') : '25',
  bonusQty: (o.type === 'compra' || o.type === 'compra_latam') && o.bonusQty ? num(o.bonusQty) : '',
  cpfQty: o.type === 'venda' && o.cpfQty != null ? String(o.cpfQty) : '',
  createdAt: o.createdAt,
});

const isBuy = (t: OpType) => t === 'compra' || t === 'compra_latam';

function toOp(d: OpDraft): Operation {
  return {
    id: d.id || '__draft',
    accountId: d.accountId,
    type: d.type,
    date: d.date || '9999-12-31',
    qty: parseBR(d.qty),
    value: d.type === 'transf' ? undefined : parseBR(d.value),
    bonus: d.type === 'transf' ? parsePct(d.bonus) : undefined,
    bonusQty: isBuy(d.type) ? parseBR(d.bonusQty) : undefined,
    cpfQty: d.type === 'venda' ? parseInt(d.cpfQty, 10) || 0 : undefined,
    createdAt: d.createdAt,
  };
}

const TYPES: { value: OpType; label: string }[] = [
  { value: 'compra', label: 'Compra Livelo' },
  { value: 'transf', label: 'Transferir' },
  { value: 'compra_latam', label: 'Compra LATAM' },
  { value: 'venda', label: 'Vender' },
];

export function OpModal({ initial, data, onClose, onSave }: {
  initial: OpDraft;
  data: Data;
  onClose: () => void;
  onSave: (op: Operation) => Promise<void>;
}) {
  const [op, setOpState] = useState<OpDraft>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<OpDraft>) => { setOpState(s => ({ ...s, ...p })); setError(''); };

  const dr = toOp(op);
  const rep = replay([...data.ops.filter(o => o.accountId === op.accountId && o.id !== op.id), dr]);
  const d = rep.rows[dr.id] || {};

  type Line = { label: string; value: string; color?: string };
  let lines: Line[] = [];
  let qtyLabel = '', valueLabel = '', hint = '';
  if (op.type === 'compra') {
    qtyLabel = 'Quantidade de pontos'; valueLabel = 'Valor pago (R$)'; hint = 'Entrada de pontos na carteira Livelo.';
    lines = [
      { label: 'Pontos creditados (compra + bônus)', value: num(d.credited) + ' pts' },
      { label: 'Custo do milheiro', value: money(d.milheiro) },
      { label: 'Custo médio Livelo após a compra', value: money(d.avgAfter) },
    ];
  } else if (op.type === 'compra_latam') {
    qtyLabel = 'Quantidade de milhas'; valueLabel = 'Valor pago (R$)'; hint = 'Entrada de milhas direto na carteira LATAM Pass.';
    lines = [
      { label: 'Milhas creditadas (compra + bônus)', value: num(d.credited) + ' milhas' },
      { label: 'Custo do milheiro', value: money(d.milheiro) },
      { label: 'Custo médio LATAM após a compra', value: money(d.avgAfter) },
    ];
  } else if (op.type === 'transf') {
    qtyLabel = 'Pontos transferidos'; hint = 'Sai da Livelo pelo custo médio; entra na LATAM com o bônus.';
    lines = [
      { label: 'Saldo Livelo na data', value: num(d.availBefore) + ' pts' },
      { label: 'Custo médio Livelo', value: money(d.avgBefore) },
      { label: 'Custo transferido', value: money(d.cost) },
      { label: 'Entram na LATAM', value: num(d.credited) + ' milhas' },
      { label: 'Milheiro na LATAM', value: money(d.milheiro), color: 'var(--color-accent-300)' },
    ];
  } else {
    qtyLabel = 'Quantidade de milhas'; valueLabel = 'Valor recebido (R$)'; hint = 'Baixa da LATAM pelo custo médio atual.';
    lines = [
      { label: 'Saldo LATAM na data', value: num(d.availBefore) + ' milhas' },
      { label: 'Custo médio LATAM', value: money(d.avgBefore) },
      { label: 'Custo das milhas vendidas', value: money(d.cost) },
      { label: 'Milheiro de venda', value: money(d.milheiro) },
      { label: 'Lucro', value: money(d.profit), color: profitColor(d.profit || 0) },
      {
        label: d.cpfCycleStart ? `CPFs no ciclo (desde ${dt(d.cpfCycleStart)})` : 'CPFs no ciclo',
        value: `${d.cpfBefore || 0} → ${d.cpfAfter || 0} de ${CPF_LIMIT}`,
        color: d.cpfOver ? 'var(--color-accent-300)' : undefined,
      },
    ];
    if (d.cpfCycleEnd) lines.push({ label: 'Contador zera em', value: dt(d.cpfCycleEnd) });
  }
  if (d.cpfOver && !error) lines.push({ label: 'Atenção', value: `Limite de ${CPF_LIMIT} CPFs no ciclo excedido`, color: 'var(--color-accent-300)' });
  if (d.insufficient && !error) lines.push({ label: 'Atenção', value: 'Saldo insuficiente nesta data', color: 'var(--color-accent-300)' });

  async function save() {
    if (!data.accounts.find(a => a.id === op.accountId)) return setError('Selecione uma conta.');
    if (!op.date) return setError('Informe a data.');
    if (!(dr.qty > 0)) return setError('Informe a quantidade.');
    if (op.type !== 'transf' && !((dr.value || 0) > 0)) return setError('Informe o valor.');
    if ((dr.bonus || 0) < 0 || (dr.bonusQty || 0) < 0) return setError('Bônus inválido.');
    if (op.type === 'venda' && !((dr.cpfQty || 0) > 0)) return setError('Informe os CPFs emitidos.');
    if (d.insufficient) return setError('Saldo insuficiente na data informada.');
    if (d.cpfOver) return setError(`Limite de ${CPF_LIMIT} CPFs excedido (restam ${Math.max(CPF_LIMIT - (d.cpfBefore || 0), 0)}; zera em ${dt(d.cpfCycleEnd)}).`);
    const rec: Operation = { id: op.id || '', accountId: op.accountId, type: op.type, date: op.date, qty: dr.qty, createdAt: op.createdAt || Date.now() };
    if (op.type === 'transf') rec.bonus = dr.bonus;
    else {
      rec.value = Math.round((dr.value || 0) * 100) / 100;
      if (op.type !== 'venda' && (dr.bonusQty || 0) > 0) rec.bonusQty = dr.bonusQty;
      if (op.type === 'venda') rec.cpfQty = dr.cpfQty;
    }
    setBusy(true);
    try {
      await onSave(rec);
    } catch (e) {
      setError((e as Error).message || 'Não foi possível salvar.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={op.id ? 'Editar operação' : 'Nova operação'} onClose={onClose}>
      <div className="field">
        <label htmlFor="op-acc">Conta</label>
        <select id="op-acc" className="input" value={op.accountId} onChange={e => set({ accountId: e.target.value })}>
          {data.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <Seg name="optype" value={op.type} options={TYPES} onChange={type => set({ type })} grid />
      <div className="muted" style={{ fontSize: 12, marginTop: -4 }}>{hint}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="op-date">Data</label>
          <input id="op-date" type="date" className="input" value={op.date} onChange={e => set({ date: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="op-qty">{qtyLabel}</label>
          <input id="op-qty" className="input" inputMode="numeric" placeholder="100.000" value={op.qty} onChange={e => set({ qty: maskQty(e.target.value) })} />
        </div>
        {op.type !== 'transf' && (
          <div className="field">
            <label htmlFor="op-val">{valueLabel}</label>
            <input
              id="op-val" className="input" inputMode="decimal" placeholder="3.000,00" value={op.value}
              onChange={e => set({ value: e.target.value.replace(/[^\d.,]/g, '') })}
              onBlur={() => { const v = parseBR(op.value); if (v > 0) set({ value: dec(v) }); }}
            />
          </div>
        )}
        {isBuy(op.type) && (
          <div className="field">
            <label htmlFor="op-bq">{op.type === 'compra_latam' ? 'Milhas de bônus' : 'Pontos de bônus'}</label>
            <input id="op-bq" className="input" inputMode="numeric" placeholder="0" value={op.bonusQty} onChange={e => set({ bonusQty: maskQty(e.target.value) })} />
          </div>
        )}
        {op.type === 'venda' && (
          <div className="field">
            <label htmlFor="op-cpf">CPFs emitidos</label>
            <input id="op-cpf" className="input" inputMode="numeric" placeholder="1" value={op.cpfQty} onChange={e => set({ cpfQty: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
          </div>
        )}
        {op.type === 'transf' && (
          <div className="field">
            <label htmlFor="op-bonus">Bônus (%)</label>
            <input id="op-bonus" className="input" inputMode="decimal" placeholder="0" value={op.bonus} onChange={e => set({ bonus: e.target.value.replace(/[^\d,]/g, '') })} />
          </div>
        )}
      </div>
      <div className="preview">
        {lines.map(l => (
          <div className="preview-row" key={l.label}>
            <span>{l.label}</span>
            <span style={{ color: l.color || 'var(--color-text)' }}>{l.value}</span>
          </div>
        ))}
      </div>
      <ErrorLine>{error}</ErrorLine>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" onClick={save} disabled={busy}><Check className="icon" />{busy ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Dialog>
  );
}
