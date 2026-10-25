import {
  calculateDashboardSnapshot,
  deleteTransaction,
  normalizeTransaction,
  upsertTransaction,
} from './dashboard-core.js';

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const state = {
  referenceDate: new Date('2026-10-25T00:00:00'),
  accounts: [
    { id: 'acc-1', name: 'Main Checking', startingBalance: 95800 },
    { id: 'acc-2', name: 'Savings', startingBalance: 220000 },
    { id: 'acc-3', name: 'Travel Wallet', startingBalance: 15000 },
  ],
  transactions: [
    { id: 't1', accountId: 'acc-1', date: '2026-10-02', type: 'expense', category: 'Housing', amount: 24500, merchant: 'Rent' },
    { id: 't2', accountId: 'acc-1', date: '2026-10-03', type: 'income', category: 'Salary', amount: 125000, merchant: 'Employer' },
    { id: 't3', accountId: 'acc-1', date: '2026-10-08', type: 'expense', category: 'Groceries', amount: 6800, merchant: 'Fresh Basket' },
    { id: 't4', accountId: 'acc-2', date: '2026-10-10', type: 'expense', category: 'Transport', amount: 2200, merchant: 'Metro' },
    { id: 't5', accountId: 'acc-2', date: '2026-10-12', type: 'income', category: 'Freelance', amount: 32000, merchant: 'Client A' },
    { id: 't6', accountId: 'acc-1', date: '2026-10-14', type: 'expense', category: 'Dining', amount: 4100, merchant: 'Café' },
    { id: 't7', accountId: 'acc-3', date: '2026-10-15', type: 'expense', category: 'Travel', amount: 7900, merchant: 'Train Booking' },
    { id: 't8', accountId: 'acc-1', date: '2026-09-27', type: 'expense', category: 'Insurance', amount: 5600, merchant: 'Policy Premium' },
    { id: 't9', accountId: 'acc-1', date: '2026-10-17', type: 'expense', category: 'Utilities', amount: 1800, merchant: 'Electricity' },
    { id: 't10', accountId: 'acc-1', date: '2026-10-20', type: 'expense', category: 'Entertainment', amount: 2100, merchant: 'Streaming' },
    { id: 't11', accountId: 'acc-2', date: '2026-10-22', type: 'expense', category: 'Health', amount: 3700, merchant: 'Pharmacy' },
    { id: 't12', accountId: 'acc-1', date: '2026-10-25', type: 'income', category: 'Bonus', amount: 18000, merchant: 'Company' },
  ],
  budgets: [
    { id: 'b1', category: 'Housing', limit: 45000 },
    { id: 'b2', category: 'Groceries', limit: 12000 },
    { id: 'b3', category: 'Travel', limit: 8000 },
  ],
  goals: [
    { id: 'g1', name: 'Emergency Fund', target: 300000, current: 180000 },
    { id: 'g2', name: 'Vacation Fund', target: 120000, current: 45000 },
  ],
  bills: [
    { id: 'bill-1', name: 'Internet', dueDate: '2026-10-28', amount: 1299, status: 'upcoming' },
    { id: 'bill-2', name: 'Phone', dueDate: '2026-10-31', amount: 799, status: 'upcoming' },
    { id: 'bill-3', name: 'Insurance', dueDate: '2026-10-18', amount: 5600, status: 'overdue' },
  ],
};

const formState = {
  currentTransactionId: null,
};

function renderBudgetGoals(snapshot) {
  const budgetGoalsContainer = document.getElementById('budget-goals');

  const budgetMarkup = snapshot.budgetProgress.length
    ? snapshot.budgetProgress.map((budget) => `
        <div class="progress-item">
          <div class="progress-meta">
            <strong>${budget.category}</strong>
            <span>${currencyFormatter.format(budget.spent)} / ${currencyFormatter.format(budget.limit)}</span>
          </div>
          <div class="progress-bar"><span class="progress-fill" style="width: ${budget.progress}%"></span></div>
        </div>
      `).join('')
    : '<p class="meta">No active budgets.</p>';

  const goalsMarkup = snapshot.goalProgress.length
    ? snapshot.goalProgress.map((goal) => `
        <div class="progress-item">
          <div class="progress-meta">
            <strong>${goal.name}</strong>
            <span>${currencyFormatter.format(goal.current)} / ${currencyFormatter.format(goal.target)}</span>
          </div>
          <div class="progress-bar"><span class="progress-fill" style="width: ${goal.progress}%"></span></div>
        </div>
      `).join('')
    : '<p class="meta">No savings goals.</p>';

  budgetGoalsContainer.innerHTML = `${budgetMarkup}${goalsMarkup}`;
}

function renderRecentTransactions(snapshot) {
  const container = document.getElementById('recent-transactions');

  container.innerHTML = snapshot.recentTransactions.length
    ? snapshot.recentTransactions.map((transaction) => `
        <div class="list-item">
          <div>
            <strong>${transaction.merchant || transaction.category}</strong>
            <div class="meta">${transaction.category} • ${dateFormatter.format(new Date(transaction.date))}</div>
          </div>
          <div style="text-align: right;">
            <div class="amount ${transaction.type === 'income' ? 'income' : 'expense'}">
              ${transaction.type === 'income' ? '+' : '-'}${currencyFormatter.format(Math.abs(transaction.amount))}
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px;">
              <button class="mini-btn" data-action="edit" data-id="${transaction.id}" type="button">Edit</button>
              <button class="mini-btn danger" data-action="delete" data-id="${transaction.id}" type="button">Delete</button>
            </div>
          </div>
        </div>
      `).join('')
    : '<p class="meta">No transactions recorded yet.</p>';

  container.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      const transactionId = button.dataset.id;
      if (action === 'delete') {
        state.transactions = state.transactions.filter((transaction) => transaction.id !== transactionId);
        renderDashboard();
        return;
      }

      const selected = state.transactions.find((transaction) => transaction.id === transactionId);
      if (!selected) return;
      formState.currentTransactionId = transactionId;
      document.getElementById('type').value = selected.type;
      document.getElementById('accountId').value = selected.accountId;
      document.getElementById('category').value = selected.category || 'Uncategorized';
      document.getElementById('amount').value = selected.amount;
      document.getElementById('date').value = selected.date;
      document.getElementById('merchant').value = selected.merchant || '';
      openTransactionDialog();
    });
  });
}

function renderBills(snapshot) {
  const container = document.getElementById('upcoming-bills');
  container.innerHTML = snapshot.upcomingBills.length
    ? snapshot.upcomingBills.map((bill) => `
        <div class="list-item">
          <div>
            <strong>${bill.name}</strong>
            <div class="meta">Due ${dateFormatter.format(new Date(bill.dueDate))}</div>
          </div>
          <div>
            <div class="amount neutral">${currencyFormatter.format(bill.amount)}</div>
            <span class="badge ${bill.status === 'overdue' ? 'expense' : 'bill'}">${bill.status}</span>
          </div>
        </div>
      `).join('')
    : '<p class="meta">No upcoming bills.</p>';
}

function renderCategoryBreakdown(snapshot) {
  const container = document.getElementById('category-breakdown');
  container.innerHTML = snapshot.categoryBreakdown.length
    ? snapshot.categoryBreakdown.map((item) => {
        const width = snapshot.maxCategoryValue ? (item.value / snapshot.maxCategoryValue) * 100 : 0;
        return `
          <div class="category-item">
            <div class="category-label">
              <span>${item.label}</span>
              <span>${currencyFormatter.format(item.value)}</span>
            </div>
            <div class="bar"><span class="bar-fill" style="width: ${width}%"></span></div>
          </div>
        `;
      }).join('')
    : '<p class="meta">No expense categories for this month.</p>';
}

function renderDashboard() {
  const snapshot = calculateDashboardSnapshot({
    transactions: state.transactions,
    accounts: state.accounts,
    budgets: state.budgets,
    goals: state.goals,
    bills: state.bills,
    referenceDate: state.referenceDate,
  });

  document.getElementById('total-balance').textContent = currencyFormatter.format(snapshot.totalBalance);
  document.getElementById('balance-meta').textContent = `Across ${snapshot.accountCount} accounts`;
  document.getElementById('monthly-income').textContent = currencyFormatter.format(snapshot.monthlyIncome);
  document.getElementById('monthly-expenses').textContent = currencyFormatter.format(snapshot.monthlyExpenses);
  document.getElementById('monthly-net').textContent = `${snapshot.netCashFlow >= 0 ? '+' : '-'}${currencyFormatter.format(Math.abs(snapshot.netCashFlow))}`;

  renderCategoryBreakdown(snapshot);
  renderBills(snapshot);
  renderRecentTransactions(snapshot);
  renderBudgetGoals(snapshot);
}

function populateAccountOptions() {
  const select = document.getElementById('accountId');
  select.innerHTML = state.accounts.map((account) => `<option value="${account.id}">${account.name}</option>`).join('');
}

function openTransactionDialog() {
  const dialog = document.getElementById('transaction-dialog');
  const dateInput = document.getElementById('date');
  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
  dialog.showModal();
}

function closeTransactionDialog() {
  document.getElementById('transaction-dialog').close();
  formState.currentTransactionId = null;
  document.getElementById('transaction-form').reset();
}

function saveTransaction(event) {
  event.preventDefault();
  const payload = normalizeTransaction({
    id: formState.currentTransactionId || `txn-${Date.now()}`,
    accountId: document.getElementById('accountId').value,
    date: document.getElementById('date').value || new Date().toISOString().slice(0, 10),
    type: document.getElementById('type').value,
    category: document.getElementById('category').value || 'Uncategorized',
    amount: Number(document.getElementById('amount').value || 0),
    merchant: document.getElementById('merchant').value || 'Manual entry',
  });

  state.transactions = upsertTransaction(state.transactions, payload);
  renderDashboard();
  closeTransactionDialog();
}

function bindEvents() {
  document.getElementById('add-transaction-btn').addEventListener('click', () => {
    formState.currentTransactionId = null;
    document.getElementById('transaction-form').reset();
    document.getElementById('type').value = 'expense';
    document.getElementById('accountId').value = state.accounts[0]?.id || '';
    document.getElementById('date').value = new Date().toISOString().slice(0, 10);
    openTransactionDialog();
  });

  document.getElementById('close-transaction-dialog').addEventListener('click', closeTransactionDialog);
  document.getElementById('cancel-transaction').addEventListener('click', closeTransactionDialog);
  document.getElementById('transaction-form').addEventListener('submit', saveTransaction);
}

populateAccountOptions();
bindEvents();
renderDashboard();
