import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replay, replayAll, avg, cpfStatusAt, plus12Months } from './calc.ts';
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

test('CPFs: cada emissão libera os seus CPFs 12 meses depois (janela móvel)', () => {
  const r = replay([
    op({ id: 'c', type: 'compra_latam', date: '2025-01-01', qty: 1000000, value: 20000 }),
    op({ id: 'v1', type: 'venda', date: '2025-03-10', qty: 10000, value: 300, cpfQty: 4 }),
    op({ id: 'v2', type: 'venda', date: '2025-08-01', qty: 10000, value: 300, cpfQty: 20 }), // 24 em uso
    op({ id: 'v3', type: 'venda', date: '2026-03-09', qty: 10000, value: 300, cpfQty: 1 }), // ainda 24 → estoura
    op({ id: 'v4', type: 'venda', date: '2026-03-10', qty: 10000, value: 300, cpfQty: 4 }), // 4 de v1 liberados
    op({ id: 'v5', type: 'venda', date: '2026-07-31', qty: 10000, value: 300, cpfQty: 1 }), // v2 ainda em uso
    op({ id: 'v6', type: 'venda', date: '2026-08-01', qty: 10000, value: 300, cpfQty: 18 }), // v2 liberou 20 → 6 + 18 = 24
  ]);
  assert.equal(r.rows['v2'].cpfAfter, 24);
  assert.equal(r.rows['v2'].cpfOver, false);
  assert.equal(r.rows['v3'].cpfBefore, 24);
  assert.equal(r.rows['v3'].cpfOver, true);
  assert.deepEqual(r.rows['v3'].cpfNext, { date: '2026-03-10', qty: 4 });
  assert.equal(r.rows['v4'].cpfBefore, 21); // 20 (v2) + 1 (v3)
  assert.equal(r.rows['v4'].cpfRelease, '2027-03-10');
  assert.equal(r.rows['v5'].cpfOver, true); // 20 + 1 + 4 = 25
  assert.equal(r.rows['v6'].cpfBefore, 6); // 1 (v3) + 4 (v4) + 1 (v5)
  assert.equal(r.rows['v6'].cpfAfter, 24);
  assert.equal(r.rows['v6'].cpfOver, false);
});

test('cpfStatusAt: em uso, disponíveis e próxima liberação', () => {
  const em = [
    { opId: 'a', date: '2026-01-05', qty: 4, release: '2027-01-05' },
    { opId: 'b', date: '2026-01-05', qty: 2, release: '2027-01-05' },
    { opId: 'c', date: '2026-06-01', qty: 10, release: '2027-06-01' },
    { opId: 'f', date: '2026-12-01', qty: 3, release: '2027-12-01' }, // futura
  ];
  assert.deepEqual(cpfStatusAt(em, '2026-09-26'), { used: 16, free: 8, next: { date: '2027-01-05', qty: 6 } });
  assert.deepEqual(cpfStatusAt(em, '2027-01-05'), { used: 13, free: 11, next: { date: '2027-06-01', qty: 10 } });
  assert.deepEqual(cpfStatusAt(em, '2028-01-01'), { used: 0, free: 24, next: null });
});

test('plus12Months trata 29/02', () => {
  assert.equal(plus12Months('2028-02-29'), '2029-03-01');
  assert.equal(plus12Months('2026-09-25'), '2027-09-25');
});

test('Livelo → Livelo: sai pelo custo médio da origem (com bônus) e recalcula o custo médio do destino', () => {
  const r = replayAll([
    // origem: 100.000 + 20.000 de bônus por R$ 3.000 → R$ 25,00/milheiro
    op({ id: 'c1', accountId: 'a', type: 'compra', date: '2026-01-01', qty: 100000, value: 3000, bonusQty: 20000 }),
    // destino: 50.000 por R$ 1.750 → R$ 35,00/milheiro
    op({ id: 'c2', accountId: 'b', type: 'compra', date: '2026-01-01', qty: 50000, value: 1750 }),
    op({ id: 't', accountId: 'a', toAccountId: 'b', type: 'transf_livelo', date: '2026-01-05', qty: 60000 }),
  ]);
  assert.equal(r.a.L.q, 60000);
  assert.equal(r.a.L.c, 1500);
  assert.equal(avg(r.a.L).toFixed(2), '25.00');
  assert.equal(r.a.rows['t'].cost, 1500);
  assert.equal(r.a.rows['t'].side, 'out');
  assert.equal(r.b.L.q, 110000);
  assert.equal(r.b.L.c, 3250);
  assert.equal(avg(r.b.L).toFixed(2), '29.55'); // (1.750 + 1.500) / 110
  assert.equal(r.b.rows['t'].side, 'in');
  assert.equal(r.b.rows['t'].cost, 1500);
});

test('Livelo → Livelo: taxa entra no custo do destino e o destino pode transferir para a LATAM depois', () => {
  const r = replayAll([
    op({ id: 'c1', accountId: 'a', type: 'compra', date: '2026-01-01', qty: 100000, value: 3000 }),
    op({ id: 't', accountId: 'a', toAccountId: 'b', type: 'transf_livelo', date: '2026-01-02', qty: 100000, value: 100 }),
    op({ id: 'x', accountId: 'b', type: 'transf', date: '2026-01-03', qty: 100000, bonus: 25 }),
  ]);
  assert.equal(r.a.L.q, 0);
  assert.equal(r.a.L.c, 0);
  assert.equal(r.b.rows['t'].cost, 3100);
  assert.equal(r.b.rows['x'].insufficient, false);
  assert.equal(r.b.T.q, 125000);
  assert.equal(avg(r.b.T).toFixed(2), '24.80'); // 3.100 / 125
});

test('Livelo → Livelo: saldo insuficiente na origem e ordem entre contas', () => {
  const r = replayAll([
    op({ id: 'x', accountId: 'b', type: 'transf', date: '2026-01-01', qty: 1000, bonus: 0 }), // antes de receber
    op({ id: 't', accountId: 'a', toAccountId: 'b', type: 'transf_livelo', date: '2026-01-02', qty: 1000 }),
  ]);
  assert.equal(r.a.rows['t'].insufficient, true);
  assert.equal(r.b.rows['x'].insufficient, true);
  assert.equal(r.b.L.q, 0); // −1.000 da transferência sem saldo + 1.000 recebidos
});
