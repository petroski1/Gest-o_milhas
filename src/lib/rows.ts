import { buyBonus, type RowCalc } from './calc.ts';
import { dt, money, num } from './format.ts';
import type { Account, Operation } from './types.ts';

export type Row = {
  op: Operation;
  account: Account;
  sortKey: string;
  date: string;
  typeLabel: string;
  tagClass: string;
  warn: boolean;
  cpfWarn: boolean;
  qty: string;
  qtySub: string;
  value: string;
  valueSub: string;
  milheiro: string;
  milheiroSub: string;
  result: string;
  resultColor: string;
};

export const profitColor = (v: number) =>
  v > 0.004 ? 'var(--color-accent-300)' : v < -0.004 ? 'var(--color-neutral-400)' : 'var(--color-text)';

export function buildRow(o: Operation, d: RowCalc, a: Account): Row {
  const muted = 'var(--color-neutral-600)';
  const base = {
    op: o,
    account: a,
    sortKey: o.date + '|' + String(o.createdAt || 0).padStart(16, '0'),
    date: dt(o.date),
    warn: !!d.insufficient,
    cpfWarn: !!d.cpfOver,
  };
  const bb = buyBonus(o);
  const bq = (unit: string) =>
    bb
      ? { qty: `${num(o.qty)} → ${num(d.credited)}`, qtySub: `${unit} · bônus de ${num(bb)}` }
      : { qty: num(o.qty), qtySub: unit };

  if (o.type === 'compra' || o.type === 'compra_latam') {
    const livelo = o.type === 'compra';
    return {
      ...base,
      typeLabel: livelo ? 'Compra Livelo' : 'Compra LATAM',
      tagClass: 'tag-neutral',
      ...bq(livelo ? 'pontos Livelo' : 'milhas LATAM'),
      value: money(o.value),
      valueSub: 'pago',
      milheiro: money(d.milheiro),
      milheiroSub: 'custo da compra',
      result: '—',
      resultColor: muted,
    };
  }
  if (o.type === 'transf') {
    return {
      ...base,
      typeLabel: 'Transferência',
      tagClass: 'tag-outline',
      qty: `${num(o.qty)} → ${num(d.credited)}`,
      qtySub: `bônus de ${String(o.bonus || 0).replace('.', ',')}%`,
      value: money(d.cost),
      valueSub: 'custo transferido',
      milheiro: money(d.milheiro),
      milheiroSub: 'entrada na LATAM',
      result: '—',
      resultColor: muted,
    };
  }
  return {
    ...base,
    typeLabel: 'Venda LATAM',
    tagClass: 'tag-accent',
    qty: num(o.qty),
    qtySub: o.cpfQty ? `milhas LATAM · ${o.cpfQty === 1 ? '1 CPF' : `${o.cpfQty} CPFs`}` : 'milhas LATAM',
    value: money(o.value),
    valueSub: 'recebido',
    milheiro: money(d.milheiro),
    milheiroSub: `custo ${money(d.costMilheiro)}`,
    result: money(d.profit),
    resultColor: profitColor(d.profit || 0),
  };
}
