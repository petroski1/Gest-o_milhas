import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, avg, cpfCycleAt, plus12Months } from './calc.ts';
import type { Operation } from './types.ts';

const op = (p: Partial<Operation> & Pick<Operation, 'id' | 'type' | 'date' | 'qty'>): Operation => ({
  accountId: 'a', createdAt: 0, ...p,
});

test('compra com bônus: 100.000 + 10.000 por R$ 3.000 → R$ 27,27/milheiro', () => {
  const r = replay([op({ id: '1', type: 'compra', date: '2026-01-01', qty: 100000, value: 3000, bonusQty: 10000 })]);
  assert.equal(r.L.q, 110000);
  assert.equal(r.rows['1'].milheiro!.toFixed(2), '27.27');
});

test('transferência de referência: R$ 30/milheiro + 25% → R$ 24,00/milheiro', () => {
  const r = replay([
    op({ id: '1', type: 'compra', date: '2026-01-01', qty: 100000, value: 3000 }),
    op({ id: '2', type: 'transf', date: '2026-01-02', qty: 100000, bonus: 25 }),
  ]);
  assert.equal(r.T.q, 125000);
  assert.equal(r.L.q, 0);
  assert.equal(r.L.c, 0);
  assert.equal(avg(r.T).toFixed(2), '24.00');
});

test('venda: lucro = recebido − custo médio', () => {
  const r = replay([
    op({ id: '1', type: 'compra_latam', date: '2026-01-01', qty: 100000, value: 2000 }),
    op({ id: '2', type: 'venda', date: '2026-01-03', qty: 50000, value: 1500 }),
  ]);
  assert.equal(r.rows['2'].cost, 1000);
  assert.equal(r.profit, 500);
  assert.equal(r.T.q, 50000);
});

test('ordem cronológica e saldo insuficiente na data', () => {
  const r = replay([
    op({ id: 'v', type: 'venda', date: '2026-01-01', qty: 10, value: 1 }),
    op({ id: 'c', type: 'compra_latam', date: '2026-01-05', qty: 1000, value: 20 }),
  ]);
  assert.equal(r.rows['v'].insufficient, true);
});

test('CPFs: ciclo de 12 meses a partir da primeira emissão', () => {
  const r = replay([
    op({ id: 'c', type: 'compra_latam', date: '2025-01-01', qty: 1000000, value: 20000 }),
    op({ id: 'v1', type: 'venda', date: '2025-03-10', qty: 10000, value: 300, cpfQty: 20 }),
    op({ id: 'v2', type: 'venda', date: '2025-12-01', qty: 10000, value: 300, cpfQty: 5 }), // mesmo ciclo → estoura
    op({ id: 'v3', type: 'venda', date: '2026-03-09', qty: 10000, value: 300, cpfQty: 1 }), // último dia do ciclo
    op({ id: 'v4', type: 'venda', date: '2026-03-10', qty: 10000, value: 300, cpfQty: 3 }), // zerou: novo ciclo
    op({ id: 'v5', type: 'venda', date: '2026-08-01', qty: 10000, value: 300, cpfQty: 2 }),
  ]);
  assert.equal(r.rows['v1'].cpfCycleStart, '2025-03-10');
  assert.equal(r.rows['v1'].cpfCycleEnd, '2026-03-10');
  assert.equal(r.rows['v2'].cpfBefore, 20);
  assert.equal(r.rows['v2'].cpfOver, true);
  assert.equal(r.rows['v3'].cpfBefore, 25);
  assert.equal(r.rows['v4'].cpfBefore, 0);
  assert.equal(r.rows['v4'].cpfCycleStart, '2026-03-10');
  assert.equal(r.rows['v5'].cpfAfter, 5);
  assert.deepEqual(r.cpfCycle, { start: '2026-03-10', end: '2027-03-10', used: 5 });
  assert.equal(cpfCycleAt(r, '2027-03-09')?.used, 5);
  assert.equal(cpfCycleAt(r, '2027-03-10'), null);
});

test('CPFs: novo ciclo começa na primeira emissão após vencer, não em data fixa', () => {
  const r = replay([
    op({ id: 'c', type: 'compra_latam', date: '2024-01-01', qty: 1000000, value: 20000 }),
    op({ id: 'v1', type: 'venda', date: '2024-02-01', qty: 1000, value: 30, cpfQty: 24 }),
    op({ id: 'v2', type: 'venda', date: '2025-06-15', qty: 1000, value: 30, cpfQty: 1 }),
  ]);
  assert.equal(r.rows['v2'].cpfCycleStart, '2025-06-15');
  assert.equal(r.rows['v2'].cpfCycleEnd, '2026-06-15');
  assert.equal(r.rows['v2'].cpfOver, false);
});

test('plus12Months trata 29/02', () => {
  assert.equal(plus12Months('2028-02-29'), '2029-03-01');
  assert.equal(plus12Months('2026-09-25'), '2027-09-25');
});
