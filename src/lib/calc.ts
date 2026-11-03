import type { Operation } from './types.ts';

export type Wallet = { q: number; c: number };

/** Máximo de CPFs (beneficiários) em uso ao mesmo tempo numa conta LATAM. */
export const CPF_LIMIT = 24;

/** Cada emissão ocupa os CPFs por 12 meses e os libera na mesma data do ano seguinte. */
export type CpfEmission = { opId: string; date: string; qty: number; release: string };

/** Mesma data 12 meses depois (29/02 vira 01/03). */
export const plus12Months = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return m === '02' && d === '29' ? `${+y + 1}-03-01` : `${+y + 1}-${m}-${d}`;
};

export type CpfStatus = {
  used: number; // CPFs em uso na data
  free: number; // disponíveis
  next: { date: string; qty: number } | null; // próxima liberação
};

/** CPFs em uso na data: emissões feitas até a data e ainda não liberadas. */
export function cpfStatusAt(emissions: CpfEmission[], iso: string): CpfStatus {
  const active = emissions.filter(e => e.date <= iso && e.release > iso);
  const used = active.reduce((s, e) => s + e.qty, 0);
  let next: CpfStatus['next'] = null;
  for (const e of active) {
    if (!next || e.release < next.date) next = { date: e.release, qty: e.qty };
    else if (e.release === next.date) next.qty += e.qty;
  }
  return { used, free: Math.max(CPF_LIMIT - used, 0), next };
}

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
  cpfBefore?: number; // CPFs em uso na data, antes desta venda
  cpfAfter?: number;
  cpfOver?: boolean;
  cpfRelease?: string; // data em que os CPFs desta venda são liberados
  cpfNext?: { date: string; qty: number } | null; // próxima liberação antes desta venda
  side?: 'out' | 'in'; // transf_livelo: saída (origem) ou entrada (destino)
  fee?: number; // transf_livelo: taxa paga, somada ao custo que entra no destino
};

export type Replay = {
  L: Wallet;
  T: Wallet;
  profit: number;
  revenue: number;
  sales: number;
  cpfEmissions: CpfEmission[];
  rows: Record<string, RowCalc>;
};

/** Custo médio por milheiro. */
export const avg = (w: Wallet) => (w.q > 0.0001 ? w.c / (w.q / 1000) : 0);

export const buyBonus = (o: Pick<Operation, 'bonusQty'>) => +(o.bonusQty || 0) || 0;

export const sortOps = <T extends Pick<Operation, 'date' | 'createdAt'>>(ops: T[]) =>
  [...ops].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0)));

export const emptyReplay = (): Replay => ({ L: { q: 0, c: 0 }, T: { q: 0, c: 0 }, profit: 0, revenue: 0, sales: 0, cpfEmissions: [], rows: {} });

/**
 * Reprocessa as operações de TODAS as contas juntas, em ordem cronológica.
 * Precisa ser conjunto porque a transferência Livelo → Livelo tira pontos de uma conta pelo custo médio
 * dela na data e os coloca na outra conta com esse custo.
 * Na transf_livelo, `rows[op.id]` da conta de origem traz a saída e o da conta de destino traz a entrada.
 */
export function replayAll(ops: Operation[]): Record<string, Replay> {
  const reps: Record<string, Replay> = {};
  const rep = (id: string) => (reps[id] ||= emptyReplay());
  const out = (w: Wallet, q: number) => {
    const c = w.q > 0 ? w.c * Math.min(q / w.q, 1) : 0;
    w.q -= q;
    w.c -= c;
    if (w.q <= 0.0001) w.c = 0;
    return c;
  };

  for (const o of sortOps(ops)) {
    const r = rep(o.accountId);
    const { L, T } = r;
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
    } else if (o.type === 'transf_livelo') {
      d.side = 'out';
      d.availBefore = L.q;
      d.avgBefore = avg(L);
      d.insufficient = o.qty > L.q + 0.0001;
      d.cost = out(L, o.qty);
      d.fee = value;
      d.credited = o.qty;
      d.milheiro = o.qty ? ((d.cost + value) / o.qty) * 1000 : 0;
      d.avgAfter = avg(L);
      if (o.toAccountId && o.toAccountId !== o.accountId) {
        const dest = rep(o.toAccountId).L;
        const di: RowCalc = { side: 'in', availBefore: dest.q, avgBefore: avg(dest), insufficient: d.insufficient, credited: o.qty, cost: d.cost + value, fee: value, milheiro: d.milheiro };
        dest.q += o.qty;
        dest.c += di.cost!;
        di.avgAfter = avg(dest);
        rep(o.toAccountId).rows[o.id] = di;
      }
    } else if (o.type === 'venda') {
      d.availBefore = T.q;
      d.avgBefore = avg(T);
      d.insufficient = o.qty > T.q + 0.0001;
      d.cost = out(T, o.qty);
      d.profit = value - d.cost;
      d.milheiro = o.qty ? (value / o.qty) * 1000 : 0;
      d.costMilheiro = o.qty ? (d.cost / o.qty) * 1000 : 0;
      const n = o.cpfQty || 0;
      const st = cpfStatusAt(r.cpfEmissions, o.date);
      d.cpfBefore = st.used;
      d.cpfAfter = st.used + n;
      d.cpfOver = d.cpfAfter > CPF_LIMIT;
      d.cpfNext = st.next;
      if (n > 0) {
        d.cpfRelease = plus12Months(o.date);
        r.cpfEmissions.push({ opId: o.id, date: o.date, qty: n, release: d.cpfRelease });
      }
      r.profit += d.profit;
      r.revenue += value;
      r.sales++;
    }
    r.rows[o.id] = d;
  }
  return reps;
}

/** Replay de uma conta (por padrão, a da primeira operação). Transferências entre contas usam as demais operações recebidas. */
export function replay(ops: Operation[], accountId = ops[0]?.accountId): Replay {
  return (accountId && replayAll(ops)[accountId]) || emptyReplay();
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
