import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const CATEGORIES = ['Food', 'Rent', 'Transport', 'Entertainment', 'Utilities', 'Healthcare', 'Savings', 'Other'];

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
function fmt(v) { return currencyFormatter.format(v); }

function currentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { first, last };
}

export default function Budget({ userId }) {
  const [budgets, setBudgets] = useState(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c, '']))
  );
  const [spent, setSpent] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  useEffect(() => {
    let active = true;
    const { first, last } = currentMonthRange();

    async function load() {
      const [budgetsRes, txRes] = await Promise.all([
        supabase.from('budgets').select('*').eq('user_id', userId),
        supabase
          .from('transactions')
          .select('category, amount')
          .eq('user_id', userId)
          .eq('type', 'Expense')
          .gte('date', first)
          .lte('date', last),
      ]);

      if (!active) return;

      if (budgetsRes.data) {
        const updated = { ...Object.fromEntries(CATEGORIES.map((c) => [c, ''])) };
        for (const row of budgetsRes.data) {
          if (row.category in updated) updated[row.category] = String(row.monthly_limit);
        }
        setBudgets(updated);
      }

      const spentMap = {};
      for (const tx of txRes.data || []) {
        spentMap[tx.category] = (spentMap[tx.category] || 0) + Number(tx.amount);
      }
      setSpent(spentMap);
      setLoading(false);
    }

    load();
    return () => { active = false; };
  }, [userId]);

  const handleChange = (category, value) => {
    setBudgets((prev) => ({ ...prev, [category]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);

    const rows = CATEGORIES.map((category) => ({
      user_id: userId,
      category,
      monthly_limit: parseFloat(budgets[category]) || 0,
    }));

    const { error } = await supabase
      .from('budgets')
      .upsert(rows, { onConflict: 'user_id,category' });

    setSaveMsg(error ? { type: 'error', text: error.message } : { type: 'success', text: 'Budgets saved.' });
    setSaving(false);
  };

  if (loading) return <p className="panel-loading">Loading budgets…</p>;

  const { first, last } = currentMonthRange();
  const monthLabel = new Date(first).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="tab-content">
      <article className="panel form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Set limits</p>
            <h2>Monthly budgets</h2>
          </div>
        </div>

        <div className="budget-input-grid">
          {CATEGORIES.map((cat) => (
            <div className="form-field" key={cat}>
              <label className="form-label" htmlFor={`budget-${cat}`}>{cat} ($)</label>
              <input
                id={`budget-${cat}`}
                className="form-input"
                type="number"
                min="0"
                step="1"
                value={budgets[cat]}
                onChange={(e) => handleChange(cat, e.target.value)}
                placeholder="0"
              />
            </div>
          ))}
        </div>

        {saveMsg && (
          <p className={`auth-message ${saveMsg.type === 'error' ? 'auth-message-error' : 'auth-message-success'}`}>
            {saveMsg.text}
          </p>
        )}

        <button className="primary-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save budgets'}
        </button>
      </article>

      <article className="panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Current period: {monthLabel}</p>
            <h2>Budget vs actual</h2>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Budget</th>
                <th>Spent this month</th>
                <th>Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((cat) => {
                const limit = parseFloat(budgets[cat]) || 0;
                const spentAmt = spent[cat] || 0;
                const remaining = limit - spentAmt;
                const over = limit > 0 && spentAmt > limit;
                const noBudget = limit === 0;

                return (
                  <tr key={cat}>
                    <td>{cat}</td>
                    <td>{limit > 0 ? fmt(limit) : <span className="muted-text">Not set</span>}</td>
                    <td>{spentAmt > 0 ? fmt(spentAmt) : <span className="muted-text">$0</span>}</td>
                    <td>{noBudget ? <span className="muted-text">—</span> : fmt(Math.max(remaining, 0))}</td>
                    <td>
                      {noBudget ? (
                        <span className="type-pill" style={{ background: 'rgba(92,104,116,0.12)', color: '#5c6874' }}>No limit</span>
                      ) : over ? (
                        <span className="type-pill expense-pill">Over by {fmt(spentAmt - limit)}</span>
                      ) : (
                        <span className="type-pill income-pill">On track</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="table-note">Showing expense transactions between {first} and {last}.</p>
      </article>
    </div>
  );
}
