import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';

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

function fmt(value) {
  return currencyFormatter.format(value);
}

function fmtDate(value) {
  const d = new Date(value);
  return isNaN(d) ? value : dateFormatter.format(d);
}

function stripMarkdown(text) {
  return text.replace(/\*\*/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function Overview({ userId }) {
  const [transactions, setTransactions] = useState([]);
  const [advice, setAdvice] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      const [txRes, advRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', userId),
        supabase.from('ai_advice_history').select('*').eq('user_id', userId).order('recorded_at', { ascending: false }).limit(3),
      ]);

      if (!active) return;

      setTransactions(txRes.data || []);
      setAdvice(advRes.data || []);
      setLoading(false);
    }

    load();
    return () => { active = false; };
  }, [userId]);

  const metrics = useMemo(() => {
    const income = transactions.filter((t) => t.type === 'Income').reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions.filter((t) => t.type === 'Expense').reduce((s, t) => s + Number(t.amount), 0);

    const categoryTotals = transactions
      .filter((t) => t.type === 'Expense')
      .reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + Number(t.amount); return acc; }, {});

    const topCategories = Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([category, amount]) => ({
        category,
        amount,
        share: expense > 0 ? Math.round((amount / expense) * 100) : 0,
      }));

    return { income, expense, net: income - expense, count: transactions.length, topCategories };
  }, [transactions]);

  if (loading) return <p className="panel-loading">Loading overview…</p>;

  return (
    <div className="tab-content">
      <section className="metrics-grid">
        <article className="metric-card highlight-card">
          <span>Net balance</span>
          <strong>{fmt(metrics.net)}</strong>
          <small>{metrics.count} transactions total</small>
        </article>
        <article className="metric-card">
          <span>Total income</span>
          <strong>{fmt(metrics.income)}</strong>
        </article>
        <article className="metric-card">
          <span>Total expenses</span>
          <strong>{fmt(metrics.expense)}</strong>
        </article>
        <article className="metric-card">
          <span>AI advice history</span>
          <strong>{advice.length > 0 ? advice.length + '+' : '0'}</strong>
          <small>Saved recommendations</small>
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
          {metrics.topCategories.length === 0 ? (
            <p className="empty-state">No expense transactions yet. Add some in the Transactions tab.</p>
          ) : (
            <div className="category-list">
              {metrics.topCategories.map((item) => (
                <div className="category-row" key={item.category}>
                  <div className="category-copy">
                    <strong>{item.category}</strong>
                    <span>{fmt(item.amount)}</span>
                  </div>
                  <div className="category-bar-track" aria-hidden="true">
                    <div className="category-bar-fill" style={{ width: `${Math.max(item.share, 6)}%` }} />
                  </div>
                  <small>{item.share}% of expenses</small>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Latest guidance</p>
              <h2>AI advice</h2>
            </div>
          </div>
          {advice.length === 0 ? (
            <p className="empty-state">No advice saved yet. Add entries in the AI Advice tab.</p>
          ) : (
            <div className="advice-stack">
              {advice.map((entry) => (
                <section className="advice-card" key={entry.id}>
                  <p className="advice-focus">{entry.focus}</p>
                  <p className="advice-preview">{stripMarkdown(entry.advice).slice(0, 220)}…</p>
                  <small>{fmtDate(entry.recorded_at)} · {entry.model || 'AI'}</small>
                </section>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  );
}
