import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, avg } from './calc.ts';
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

test('CPFs emitidos: soma por ano civil e sinaliza acima de 24', () => {
  const r = replay([
    op({ id: 'c', type: 'compra_latam', date: '2025-01-01', qty: 1000000, value: 20000 }),
    op({ id: 'v1', type: 'venda', date: '2025-06-01', qty: 10000, value: 300, cpfQty: 20 }),
    op({ id: 'v2', type: 'venda', date: '2025-12-01', qty: 10000, value: 300, cpfQty: 5 }),
    op({ id: 'v3', type: 'venda', date: '2026-01-02', qty: 10000, value: 300, cpfQty: 4 }),
  ]);
  assert.equal(r.cpfByYear['2025'], 25);
  assert.equal(r.cpfByYear['2026'], 4);
  assert.equal(r.rows['v1'].cpfOver, false);
  assert.equal(r.rows['v2'].cpfBefore, 20);
  assert.equal(r.rows['v2'].cpfOver, true);
  assert.equal(r.rows['v3'].cpfOver, false);
});
