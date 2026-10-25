export const DEFAULT_CURRENCY = 'INR';

export function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

export function safeNumber(value) {
  return roundMoney(Number(value || 0));
}

export function normalizeTransaction(transaction = {}) {
  return {
    id: transaction.id || `txn-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    accountId: transaction.accountId || '',
    date: transaction.date || new Date().toISOString().slice(0, 10),
    type: String(transaction.type || 'expense').toLowerCase(),
    category: transaction.category || 'Uncategorized',
    amount: safeNumber(transaction.amount),
    merchant: transaction.merchant || '',
    notes: transaction.notes || '',
    direction: transaction.direction || (transaction.type === 'income' ? 'in' : 'out'),
  };
}

export function getAccountingSign(transaction) {
  const normalized = normalizeTransaction(transaction);

  switch (normalized.type) {
    case 'income':
      return 1;
    case 'expense':
      return -1;
    case 'transfer':
      return normalized.direction === 'in' ? 1 : -1;
    case 'adjustment':
      return normalized.direction === 'in' ? 1 : -1;
    default:
      return 0;
  }
}

export function calculateAccountBalance(account = {}, transactions = [], asOfDate = new Date()) {
  const safeAccount = { startingBalance: safeNumber(account.startingBalance), id: account.id || '' };
  const referenceDate = new Date(asOfDate);

  const netTransactions = transactions
    .filter((transaction) => normalizeTransaction(transaction).accountId === safeAccount.id)
    .filter((transaction) => {
      const txnDate = new Date(`${normalizeTransaction(transaction).date}T00:00:00`);
      return txnDate <= referenceDate;
    })
    .reduce((sum, transaction) => {
      const normalized = normalizeTransaction(transaction);
      return sum + getAccountingSign(normalized) * normalized.amount;
    }, 0);

  return roundMoney(safeAccount.startingBalance + netTransactions);
}

export function sumTransactions(transactions = [], predicate = () => true) {
  return roundMoney(
    transactions
      .filter(predicate)
      .reduce((sum, transaction) => sum + safeNumber(normalizeTransaction(transaction).amount), 0)
  );
}

export function getMonthTransactions(transactions = [], referenceDate = new Date()) {
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999);

  return transactions.filter((transaction) => {
    const date = new Date(`${normalizeTransaction(transaction).date}T00:00:00`);
    return date >= monthStart && date <= monthEnd;
  });
}

export function calculateDashboardSnapshot({
  transactions = [],
  accounts = [],
  budgets = [],
  goals = [],
  bills = [],
  referenceDate = new Date(),
} = {}) {
  const monthTransactions = getMonthTransactions(transactions, referenceDate);
  const monthlyIncome = sumTransactions(monthTransactions, (transaction) => normalizeTransaction(transaction).type === 'income');
  const monthlyExpenses = sumTransactions(monthTransactions, (transaction) => normalizeTransaction(transaction).type === 'expense');
  const netCashFlow = roundMoney(monthlyIncome - monthlyExpenses);

  const totalBalance = roundMoney(
    accounts.reduce((sum, account) => sum + calculateAccountBalance(account, transactions, referenceDate), 0)
  );

  const categoryTotals = {};
  monthTransactions
    .filter((transaction) => normalizeTransaction(transaction).type === 'expense')
    .forEach((transaction) => {
      const normalized = normalizeTransaction(transaction);
      const key = normalized.category || 'Uncategorized';
      categoryTotals[key] = (categoryTotals[key] || 0) + normalized.amount;
    });

  const categoryBreakdown = Object.entries(categoryTotals)
    .map(([label, value]) => ({ label, value: roundMoney(value) }))
    .sort((a, b) => b.value - a.value);

  const maxCategoryValue = categoryBreakdown.length
    ? Math.max(...categoryBreakdown.map((item) => item.value))
    : 0;

  const recentTransactions = [...transactions]
    .map((transaction) => normalizeTransaction(transaction))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5)
    .map((transaction) => ({ ...transaction, displayAmount: transaction.type === 'income' ? transaction.amount : -transaction.amount }));

  const budgetProgress = budgets.map((budget) => {
    const limit = safeNumber(budget.limit);
    const spent = getBudgetSpentForCategory(budget.category, monthTransactions);
    return {
      id: budget.id,
      category: budget.category,
      limit,
      spent,
      progress: limit > 0 ? Math.min((spent / limit) * 100, 100) : 0,
      remaining: roundMoney(limit - spent),
    };
  });

  const goalProgress = goals.map((goal) => {
    const target = safeNumber(goal.target);
    const current = safeNumber(goal.current);
    return {
      id: goal.id,
      name: goal.name,
      target,
      current,
      progress: target > 0 ? Math.min((current / target) * 100, 100) : 0,
      remaining: roundMoney(target - current),
    };
  });

  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const upcomingBills = bills
    .filter((bill) => bill.status !== 'paid')
    .map((bill) => {
      const dueDate = new Date(`${bill.dueDate}T00:00:00`);
      const status = dueDate < today ? 'overdue' : 'upcoming';
      return {
        ...bill,
        amount: safeNumber(bill.amount),
        status,
      };
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return {
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    netCashFlow,
    categoryBreakdown,
    maxCategoryValue,
    recentTransactions,
    budgetProgress,
    goalProgress,
    upcomingBills,
    accountCount: accounts.length,
  };
}

export function getBudgetSpentForCategory(category, transactions = []) {
  return roundMoney(
    transactions
      .filter((transaction) => normalizeTransaction(transaction).type === 'expense')
      .filter((transaction) => (normalizeTransaction(transaction).category || 'Uncategorized') === category)
      .reduce((sum, transaction) => sum + safeNumber(normalizeTransaction(transaction).amount), 0)
  );
}

export function upsertTransaction(transactions = [], nextTransaction) {
  const normalized = normalizeTransaction(nextTransaction);
  const next = transactions.some((transaction) => normalizeTransaction(transaction).id === normalized.id)
    ? transactions.map((transaction) =>
        normalizeTransaction(transaction).id === normalized.id ? normalized : normalizeTransaction(transaction)
      )
    : [...transactions, normalized];
  return next;
}

export function deleteTransaction(transactions = [], transactionId) {
  return transactions.filter((transaction) => normalizeTransaction(transaction).id !== transactionId);
}

export function reconcileSnapshot(snapshot, transactions = [], accounts = [], referenceDate = new Date()) {
  const expectedTotalBalance = roundMoney(
    accounts.reduce((sum, account) => sum + calculateAccountBalance(account, transactions, referenceDate), 0)
  );

  return {
    ...snapshot,
    totalBalanceMatchesTransactions: snapshot.totalBalance === expectedTotalBalance,
    totalBalanceExpected: expectedTotalBalance,
  };
}
