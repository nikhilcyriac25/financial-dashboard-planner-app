import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function fmtDate(v) { const d = new Date(v); return isNaN(d) ? v : dateFormatter.format(d); }

function stripMarkdown(text) {
  return text.replace(/\*\*/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

const now = new Date().toISOString().slice(0, 16);

const emptyForm = { focus: '', advice: '', model: '', recorded_at: now };

export default function AdviceHistory({ userId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data } = await supabase
        .from('ai_advice_history')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false });

      if (active) {
        setEntries(data || []);
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

    if (!form.advice.trim()) { setError('Advice text is required.'); return; }

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('ai_advice_history')
      .insert({
        user_id: userId,
        recorded_at: form.recorded_at || now,
        model: form.model.trim() || null,
        focus: form.focus.trim() || null,
        advice: form.advice.trim(),
      })
      .select()
      .single();

    if (insertError) {
      setError(insertError.message);
    } else {
      setEntries((prev) => [data, ...prev]);
      setForm({ ...emptyForm, recorded_at: new Date().toISOString().slice(0, 16) });
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    const { error: deleteError } = await supabase
      .from('ai_advice_history')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (!deleteError) setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="tab-content">
      <article className="panel form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Save a recommendation</p>
            <h2>Add AI advice entry</h2>
          </div>
        </div>
        <p className="table-note" style={{ marginBottom: 18 }}>
          Paste advice you generated elsewhere (e.g. from an AI tool) to keep a searchable history.
        </p>

        <form className="inline-form" onSubmit={handleAdd}>
          <div className="form-grid">
            <div className="form-field">
              <label className="form-label" htmlFor="adv-focus">Topic / question</label>
              <input id="adv-focus" className="form-input" type="text" name="focus" value={form.focus} onChange={handleChange} placeholder="e.g. How can I reduce food spending?" maxLength={200} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="adv-model">AI model (optional)</label>
              <input id="adv-model" className="form-input" type="text" name="model" value={form.model} onChange={handleChange} placeholder="e.g. GPT-4, Claude, Gemini" maxLength={80} />
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="adv-date">Date & time</label>
              <input id="adv-date" className="form-input" type="datetime-local" name="recorded_at" value={form.recorded_at} onChange={handleChange} />
            </div>
          </div>

          <div className="form-field" style={{ marginTop: 12 }}>
            <label className="form-label" htmlFor="adv-advice">Advice text</label>
            <textarea
              id="adv-advice"
              className="form-input form-textarea"
              name="advice"
              value={form.advice}
              onChange={handleChange}
              placeholder="Paste the full AI response here…"
              rows={5}
              required
            />
          </div>

          {error && <p className="auth-message auth-message-error">{error}</p>}

          <button className="primary-btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : '+ Save advice entry'}
          </button>
        </form>
      </article>

      <article className="panel table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Saved guidance</p>
            <h2>Advice history</h2>
          </div>
        </div>

        {loading ? (
          <p className="panel-loading">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="empty-state">No advice saved yet. Add entries using the form above.</p>
        ) : (
          <div className="advice-stack-full">
            {entries.map((entry) => {
              const isExpanded = expanded === entry.id;
              const preview = stripMarkdown(entry.advice);

              return (
                <section className="advice-card-full" key={entry.id}>
                  <div className="advice-card-header">
                    <div>
                      {entry.focus && <p className="advice-focus">{entry.focus}</p>}
                      <small>{fmtDate(entry.recorded_at)}{entry.model ? ` · ${entry.model}` : ''}</small>
                    </div>
                    <button className="delete-btn" onClick={() => handleDelete(entry.id)} aria-label="Delete entry">✕</button>
                  </div>
                  <p className="advice-preview">
                    {isExpanded ? preview : preview.slice(0, 300) + (preview.length > 300 ? '…' : '')}
                  </p>
                  {preview.length > 300 && (
                    <button className="expand-btn" onClick={() => setExpanded(isExpanded ? null : entry.id)}>
                      {isExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </article>
    </div>
  );
}
