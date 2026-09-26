import type { Operation } from './types.ts';

export type Wallet = { q: number; c: number };

/** Limite de CPFs (beneficiários) emitidos por conta LATAM em cada ciclo de 12 meses. */
export const CPF_LIMIT = 24;

/** Ciclo de CPFs: começa na primeira emissão e zera 12 meses depois (end é exclusivo). */
export type CpfCycle = { start: string; end: string; used: number };

/** Mesma data 12 meses depois (29/02 vira 01/03). */
export const plus12Months = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return m === '02' && d === '29' ? `${+y + 1}-03-01` : `${+y + 1}-${m}-${d}`;
};

/** Ciclo em vigor na data informada; null se não houver (contador zerado). */
export const cpfCycleAt = (rep: Pick<Replay, 'cpfCycle'>, iso: string): CpfCycle | null =>
  rep.cpfCycle && iso >= rep.cpfCycle.start && iso < rep.cpfCycle.end ? rep.cpfCycle : null;

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
  cpfCycleStart?: string; // início do ciclo de 12 meses desta venda
  cpfCycleEnd?: string; // data em que o contador zera
  cpfBefore?: number; // CPFs já emitidos no ciclo antes desta venda
  cpfAfter?: number;
  cpfOver?: boolean;
};

export type Replay = {
  L: Wallet;
  T: Wallet;
  profit: number;
  revenue: number;
  sales: number;
  cpfCycle: CpfCycle | null; // último ciclo aberto
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
  let cycle: CpfCycle | null = null;
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
      const n = o.cpfQty || 0;
      const active = cycle && o.date < cycle.end ? cycle : null;
      // A primeira emissão após o ciclo anterior vencer abre um novo ciclo de 12 meses.
      if (!active && n > 0) cycle = { start: o.date, end: plus12Months(o.date), used: 0 };
      const cur = active || (n > 0 ? cycle : null);
      d.cpfBefore = cur ? cur.used : 0;
      d.cpfAfter = d.cpfBefore + n;
      d.cpfOver = d.cpfAfter > CPF_LIMIT;
      if (cur) {
        cur.used = d.cpfAfter;
        d.cpfCycleStart = cur.start;
        d.cpfCycleEnd = cur.end;
      }
      profit += d.profit;
      revenue += value;
      sales++;
    }
    rows[o.id] = d;
  }
  return { L, T, profit, revenue, sales, cpfCycle: cycle, rows };
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
