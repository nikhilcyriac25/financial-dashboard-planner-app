import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const CATEGORIES = ['Food', 'Rent', 'Transport', 'Entertainment', 'Utilities', 'Healthcare', 'Savings', 'Salary', 'Other'];
const TYPES = ['Expense', 'Income'];

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function fmt(v) { return currencyFormatter.format(v); }
function fmtDate(v) { const d = new Date(v); return isNaN(d) ? v : dateFormatter.format(d); }

const today = new Date().toISOString().slice(0, 10);

const emptyForm = { date: today, type: 'Expense', category: 'Food', amount: '', description: '' };

export default function Transactions({ userId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false });

      if (active) {
        setRows(error ? [] : data);
        setLoading(false);
      }
    }

    load();
    return () => { active = false; };
  }, [userId]);

  const handleChange = (e) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleAdd = async (e) => {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) { setError('Amount must be a positive number.'); return; }

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('transactions')
      .insert({ user_id: userId, date: form.date, type: form.type, category: form.category, amount, description: form.description })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else {
      setRows((prev) => [data, ...prev]);
      setForm(emptyForm);
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    const { error: deleteError } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', userId);
    if (!deleteError) setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="tab-content">
      <article className="panel form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Add new</p>
            <h2>Transaction</h2>
          </div>
        </div>

        <form className="inline-form" onSubmit={handleAdd}>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label" htmlFor="tx-date">Date</label>
              <input id="tx-date" className="form-input" type="date" name="date" value={form.date} onChange={handleChange} required />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="tx-type">Type</label>
              <select id="tx-type" className="form-input" name="type" value={form.type} onChange={handleChange}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="tx-category">Category</label>
              <select id="tx-category" className="form-input" name="category" value={form.category} onChange={handleChange}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="tx-amount">Amount ($)</label>
              <input id="tx-amount" className="form-input" type="number" name="amount" value={form.amount} onChange={handleChange} placeholder="0.00" min="0.01" step="0.01" required />
            </div>
            <div className="form-field form-field-wide">
              <label className="form-label" htmlFor="tx-description">Description</label>
              <input id="tx-description" className="form-input" type="text" name="description" value={form.description} onChange={handleChange} placeholder="Optional note" maxLength={200} />
            </div>
          </div>

          {error && <p className="auth-message auth-message-error">{error}</p>}

          <button className="primary-btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : '+ Add transaction'}
          </button>
        </form>
      </article>

      <article className="panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">History</p>
            <h2>All transactions</h2>
          </div>
        </div>

        {loading ? (
          <p className="panel-loading">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="empty-state">No transactions yet. Add one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Description</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{fmtDate(row.date)}</td>
                    <td>
                      <span className={row.type === 'Income' ? 'type-pill income-pill' : 'type-pill expense-pill'}>
                        {row.type}
                      </span>
                    </td>
                    <td>{row.category}</td>
                    <td>{fmt(row.amount)}</td>
                    <td>{row.description || '—'}</td>
                    <td>
                      <button className="delete-btn" onClick={() => handleDelete(row.id)} aria-label="Delete transaction">
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>
    </div>
  );
}
