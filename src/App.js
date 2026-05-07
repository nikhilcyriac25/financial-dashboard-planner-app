import { useEffect, useMemo, useState } from 'react';
import './App.css';

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (insideQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
      continue;
    }

    if (character === ',' && !insideQuotes) {
      row.push(current);
      current = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !insideQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }
      if (current || row.length) {
        row.push(current);
        rows.push(row);
      }
      row = [];
      current = '';
      continue;
    }

    current += character;
  }

  if (current || row.length) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) {
    return [];
  }

  const [headers, ...dataRows] = rows;

  return dataRows
    .filter((dataRow) => dataRow.some((value) => value.trim() !== ''))
    .map((dataRow) =>
      headers.reduce((record, header, headerIndex) => {
        record[header] = dataRow[headerIndex] ?? '';
        return record;
      }, {})
    );
}

function parseJsonLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function formatCurrency(value) {
  return currencyFormatter.format(value);
}

function formatDate(value) {
  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return dateFormatter.format(parsedDate);
}

function getAdvicePreview(advice) {
  return advice
    .replace(/\*\*/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function App() {
  const [transactions, setTransactions] = useState([]);
  const [adviceEntries, setAdviceEntries] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let isActive = true;

    async function loadDashboardData() {
      try {
        const [transactionsResponse, adviceResponse] = await Promise.all([
          fetch('/finance_data.csv'),
          fetch('/ai_advice_history.jsonl'),
        ]);

        if (!transactionsResponse.ok || !adviceResponse.ok) {
          throw new Error('Static dashboard data could not be loaded.');
        }

        const [transactionsText, adviceText] = await Promise.all([
          transactionsResponse.text(),
          adviceResponse.text(),
        ]);

        if (!isActive) {
          return;
        }

        const loadedTransactions = parseCsv(transactionsText)
          .map((entry) => ({
            ...entry,
            Amount: Number(entry.Amount) || 0,
          }))
          .sort((left, right) => new Date(right.Date) - new Date(left.Date));

        const loadedAdviceEntries = parseJsonLines(adviceText).sort(
          (left, right) => new Date(right.timestamp) - new Date(left.timestamp)
        );

        setTransactions(loadedTransactions);
        setAdviceEntries(loadedAdviceEntries);
        setStatus('ready');
      } catch (error) {
        if (isActive) {
          setStatus('error');
        }
      }
    }

    loadDashboardData();

    return () => {
      isActive = false;
    };
  }, []);

  const dashboardMetrics = useMemo(() => {
    const incomeTotal = transactions
      .filter((transaction) => transaction.Type === 'Income')
      .reduce((sum, transaction) => sum + transaction.Amount, 0);

    const expenseTotal = transactions
      .filter((transaction) => transaction.Type === 'Expense')
      .reduce((sum, transaction) => sum + transaction.Amount, 0);

    const categoryTotals = transactions
      .filter((transaction) => transaction.Type === 'Expense')
      .reduce((totals, transaction) => {
        const nextTotal = (totals[transaction.Category] || 0) + transaction.Amount;
        totals[transaction.Category] = nextTotal;
        return totals;
      }, {});

    const topCategories = Object.entries(categoryTotals)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([category, amount]) => ({
        category,
        amount,
        share: expenseTotal > 0 ? Math.round((amount / expenseTotal) * 100) : 0,
      }));

    return {
      incomeTotal,
      expenseTotal,
      netBalance: incomeTotal - expenseTotal,
      transactionCount: transactions.length,
      topCategories,
    };
  }, [transactions]);

  const latestAdvice = adviceEntries.slice(0, 3);

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Static web edition</p>
          <h1>Personal Finance Dashboard</h1>
          <p className="hero-text">
            A public snapshot of your transactions and AI budgeting guidance, packaged as a
            static React app that Vercel can deploy directly from GitHub.
          </p>
        </div>
        <div className="hero-badge">
          <span>Deploy target</span>
          <strong>Vercel-ready</strong>
          <small>No server required for this view.</small>
        </div>
      </section>

      {status === 'loading' ? <p className="status-banner">Loading dashboard data...</p> : null}
      {status === 'error' ? (
        <p className="status-banner status-banner-error">
          Dashboard data could not be loaded. Make sure the static files are present in public.
        </p>
      ) : null}

      {status === 'ready' ? (
        <>
          <section className="metrics-grid" aria-label="Financial summary">
            <article className="metric-card highlight-card">
              <span>Net balance</span>
              <strong>{formatCurrency(dashboardMetrics.netBalance)}</strong>
              <small>{dashboardMetrics.transactionCount} recorded transactions</small>
            </article>
            <article className="metric-card">
              <span>Total income</span>
              <strong>{formatCurrency(dashboardMetrics.incomeTotal)}</strong>
              <small>Income entries currently visible to the public</small>
            </article>
            <article className="metric-card">
              <span>Total expenses</span>
              <strong>{formatCurrency(dashboardMetrics.expenseTotal)}</strong>
              <small>Tracked spend across all categories</small>
            </article>
            <article className="metric-card">
              <span>AI advice history</span>
              <strong>{adviceEntries.length}</strong>
              <small>Saved recommendations rendered from JSONL</small>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Spending pressure</p>
                  <h2>Top expense categories</h2>
                </div>
              </div>
              <div className="category-list">
                {dashboardMetrics.topCategories.map((item) => (
                  <div className="category-row" key={item.category}>
                    <div className="category-copy">
                      <strong>{item.category}</strong>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>
                    <div className="category-bar-track" aria-hidden="true">
                      <div
                        className="category-bar-fill"
                        style={{ width: `${Math.max(item.share, 8)}%` }}
                      />
                    </div>
                    <small>{item.share}% of expenses</small>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Latest guidance</p>
                  <h2>AI budgeting recommendations</h2>
                </div>
              </div>
              <div className="advice-stack">
                {latestAdvice.map((entry) => (
                  <section className="advice-card" key={`${entry.timestamp}-${entry.focus}`}>
                    <p className="advice-focus">{entry.focus}</p>
                    <p className="advice-preview">{getAdvicePreview(entry.advice)}</p>
                    <small>
                      {formatDate(entry.timestamp)} · {entry.model}
                    </small>
                  </section>
                ))}
              </div>
            </article>
          </section>

          <section className="panel table-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Activity</p>
                <h2>Recent transactions</h2>
              </div>
              <p className="table-note">
                This static deployment reads from checked-in data files, so visitors can use the
                dashboard without a backend.
              </p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Amount</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction, index) => (
                    <tr key={`${transaction.Date}-${transaction.Category}-${index}`}>
                      <td>{formatDate(transaction.Date)}</td>
                      <td>
                        <span
                          className={
                            transaction.Type === 'Income' ? 'type-pill income-pill' : 'type-pill expense-pill'
                          }
                        >
                          {transaction.Type}
                        </span>
                      </td>
                      <td>{transaction.Category}</td>
                      <td>{formatCurrency(transaction.Amount)}</td>
                      <td>{transaction.Description || 'No description provided'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}

export default App;
