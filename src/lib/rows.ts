import { buyBonus, type RowCalc } from './calc.ts';
import { dt, money, num } from './format.ts';
import type { Account, Operation } from './types.ts';

export type Row = {
  key: string; // único por linha (a transf_livelo gera uma linha na origem e outra no destino)
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

/** `a` é a conta desta linha; `other` é a outra conta da transf_livelo. */
export function buildRow(o: Operation, d: RowCalc, a: Account, other?: Account): Row {
  const muted = 'var(--color-neutral-600)';
  const base = {
    key: o.id + (d.side === 'in' ? ':in' : ''),
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
      typeLabel: 'Livelo → LATAM',
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
  if (o.type === 'transf_livelo') {
    const inbound = d.side === 'in';
    const name = other?.name || 'outra conta';
    const fee = d.fee ? ` + taxa ${money(d.fee)}` : '';
    return {
      ...base,
      typeLabel: inbound ? 'Livelo recebida' : 'Livelo enviada',
      tagClass: 'tag-outline',
      qty: (inbound ? '+' : '−') + num(o.qty),
      qtySub: `pontos Livelo · ${inbound ? 'de' : 'para'} ${name}`,
      value: money(d.cost),
      valueSub: inbound ? `custo recebido${fee ? ' (com taxa)' : ''}` : `custo transferido${fee}`,
      milheiro: money(d.milheiro),
      milheiroSub: inbound ? 'entrada na Livelo' : `entrada em ${name}`,
      result: '—',
      resultColor: muted,
    };
  }
  return {
    ...base,
    typeLabel: 'Venda LATAM',
    tagClass: 'tag-accent',
    qty: num(o.qty),
    qtySub: o.cpfQty ? `milhas LATAM · ${o.cpfQty === 1 ? '1 CPF' : `${o.cpfQty} CPFs`}${d.cpfRelease ? ` (liberam ${dt(d.cpfRelease)})` : ''}` : 'milhas LATAM',
    value: money(o.value),
    valueSub: 'recebido',
    milheiro: money(d.milheiro),
    milheiroSub: `custo ${money(d.costMilheiro)}`,
    result: money(d.profit),
    resultColor: profitColor(d.profit || 0),
  };
}
