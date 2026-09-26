import type { Operation } from './types.ts';

export type Wallet = { q: number; c: number };

export type RowCalc = {
  credited?: number;
  milheiro?: number;
  avgAfter?: number;
  availBefore?: number;
  avgBefore?: number;
  insufficient?: boolean;
  cost?: number;
  profit?: number;
  costMilheiro?: number;
};

export type Replay = {
  L: Wallet;
  T: Wallet;
  profit: number;
  revenue: number;
  sales: number;
  rows: Record<string, RowCalc>;
};

/** Custo médio por milheiro. */
export const avg = (w: Wallet) => (w.q > 0.0001 ? w.c / (w.q / 1000) : 0);

export const buyBonus = (o: Pick<Operation, 'bonusQty'>) => +(o.bonusQty || 0) || 0;

export const sortOps = <T extends Pick<Operation, 'date' | 'createdAt'>>(ops: T[]) =>
  [...ops].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));

/** Reprocessa todas as operações de UMA conta em ordem cronológica. */
export function replay(ops: Operation[]): Replay {
  const L: Wallet = { q: 0, c: 0 };
  const T: Wallet = { q: 0, c: 0 };
  let profit = 0;
  let revenue = 0;
  let sales = 0;
  const rows: Record<string, RowCalc> = {};
  const out = (w: Wallet, q: number) => {
    const c = w.q > 0 ? w.c * Math.min(q / w.q, 1) : 0;
    w.q -= q;
    w.c -= c;
    if (w.q <= 0.0001) w.c = 0;
    return c;
  };

  for (const o of sortOps(ops)) {
    const d: RowCalc = {};
    const value = o.value || 0;
    if (o.type === 'compra' || o.type === 'compra_latam') {
      const w = o.type === 'compra' ? L : T;
      d.credited = o.qty + buyBonus(o);
      d.milheiro = d.credited ? (value / d.credited) * 1000 : 0;
      w.q += d.credited;
      w.c += value;
      d.avgAfter = avg(w);
    } else if (o.type === 'transf') {
      d.availBefore = L.q;
      d.avgBefore = avg(L);
      d.insufficient = o.qty > L.q + 0.0001;
      d.cost = out(L, o.qty);
      d.credited = Math.floor(o.qty * (1 + (o.bonus || 0) / 100));
      T.q += d.credited;
      T.c += d.cost;
      d.milheiro = d.credited ? (d.cost / d.credited) * 1000 : 0;
      d.avgAfter = avg(T);
    } else if (o.type === 'venda') {
      d.availBefore = T.q;
      d.avgBefore = avg(T);
      d.insufficient = o.qty > T.q + 0.0001;
      d.cost = out(T, o.qty);
      d.profit = value - d.cost;
      d.milheiro = o.qty ? (value / o.qty) * 1000 : 0;
      d.costMilheiro = o.qty ? (d.cost / o.qty) * 1000 : 0;
      profit += d.profit;
      revenue += value;
      sales++;
    }
    rows[o.id] = d;
  }
  return { L, T, profit, revenue, sales, rows };
}

export type Totals = { lq: number; lc: number; tq: number; tc: number; profit: number; revenue: number; sales: number };

export function totals(reps: (Replay | undefined)[]): Totals {
  const r: Totals = { lq: 0, lc: 0, tq: 0, tc: 0, profit: 0, revenue: 0, sales: 0 };
  for (const x of reps) {
    if (!x) continue;
    r.lq += x.L.q;
    r.lc += x.L.c;
    r.tq += x.T.q;
    r.tc += x.T.c;
    r.profit += x.profit;
    r.revenue += x.revenue;
    r.sales += x.sales;
  }
  return r;
}
