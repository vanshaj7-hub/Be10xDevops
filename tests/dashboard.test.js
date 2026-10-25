import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDashboardSnapshot,
  deleteTransaction,
  upsertTransaction,
} from '../src/dashboard-core.js';

test('dashboard totals reconcile to the underlying transaction records', () => {
  const accounts = [
    { id: 'checking', name: 'Checking', startingBalance: 1200 },
    { id: 'savings', name: 'Savings', startingBalance: 3600 },
  ];

  const transactions = [
    { id: 't1', accountId: 'checking', date: '2026-10-03', type: 'income', category: 'Salary', amount: 4200 },
    { id: 't2', accountId: 'checking', date: '2026-10-08', type: 'expense', category: 'Groceries', amount: 900 },
    { id: 't3', accountId: 'checking', date: '2026-10-10', type: 'expense', category: 'Housing', amount: 1600 },
    { id: 't4', accountId: 'savings', date: '2026-10-09', type: 'income', category: 'Freelance', amount: 550 },
    { id: 't5', accountId: 'savings', date: '2026-10-11', type: 'expense', category: 'Travel', amount: 300 },
  ];

  const snapshot = calculateDashboardSnapshot({
    transactions,
    accounts,
    budgets: [{ id: 'b1', category: 'Groceries', limit: 1500 }],
    goals: [{ id: 'g1', name: 'Emergency', target: 5000, current: 2500 }],
    bills: [{ id: 'bill-1', name: 'Internet', dueDate: '2026-10-14', amount: 799, status: 'upcoming' }],
    referenceDate: new Date('2026-10-25T00:00:00'),
  });

  const expectedTotalBalance = 1200 + 3600 + 4200 - 900 - 1600 + 550 - 300;
  assert.equal(snapshot.totalBalance, expectedTotalBalance);
  assert.equal(snapshot.monthlyIncome, 4750);
  assert.equal(snapshot.monthlyExpenses, 2800);
  assert.equal(snapshot.netCashFlow, 1950);
  assert.equal(snapshot.categoryBreakdown.find((entry) => entry.label === 'Housing')?.value, 1600);
  assert.equal(snapshot.upcomingBills.length, 1);
  assert.equal(snapshot.budgetProgress[0].spent, 900);
  assert.equal(snapshot.goalProgress[0].progress, 50);
});

test('dashboard totals update correctly after a transaction is added, edited, and deleted', () => {
  let transactions = [
    { id: 't1', accountId: 'checking', date: '2026-10-03', type: 'income', category: 'Salary', amount: 3000 },
    { id: 't2', accountId: 'checking', date: '2026-10-08', type: 'expense', category: 'Groceries', amount: 500 },
  ];

  const accounts = [{ id: 'checking', name: 'Checking', startingBalance: 1000 }];

  let snapshot = calculateDashboardSnapshot({ transactions, accounts, budgets: [], goals: [], bills: [], referenceDate: new Date('2026-10-25T00:00:00') });
  assert.equal(snapshot.totalBalance, 1000 + 3000 - 500);
  assert.equal(snapshot.monthlyIncome, 3000);
  assert.equal(snapshot.monthlyExpenses, 500);

  transactions = upsertTransaction(transactions, {
    id: 't3',
    accountId: 'checking',
    date: '2026-10-15',
    type: 'expense',
    category: 'Dining',
    amount: 220,
  });
  snapshot = calculateDashboardSnapshot({ transactions, accounts, budgets: [], goals: [], bills: [], referenceDate: new Date('2026-10-25T00:00:00') });
  assert.equal(snapshot.monthlyExpenses, 720);
  assert.equal(snapshot.totalBalance, 1000 + 3000 - 500 - 220);

  transactions = upsertTransaction(transactions, {
    id: 't2',
    accountId: 'checking',
    date: '2026-10-08',
    type: 'expense',
    category: 'Groceries',
    amount: 700,
  });
  snapshot = calculateDashboardSnapshot({ transactions, accounts, budgets: [], goals: [], bills: [], referenceDate: new Date('2026-10-25T00:00:00') });
  assert.equal(snapshot.monthlyExpenses, 920);
  assert.equal(snapshot.totalBalance, 1000 + 3000 - 700 - 220);

  transactions = deleteTransaction(transactions, 't3');
  snapshot = calculateDashboardSnapshot({ transactions, accounts, budgets: [], goals: [], bills: [], referenceDate: new Date('2026-10-25T00:00:00') });
  assert.equal(snapshot.monthlyExpenses, 700);
  assert.equal(snapshot.totalBalance, 1000 + 3000 - 700);
});
