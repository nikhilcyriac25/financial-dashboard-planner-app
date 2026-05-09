import { useEffect, useState, useRef } from 'react';
import { supabase } from '../supabaseClient';

const OLLAMA_CHAT_URL = 'http://localhost:11434/api/chat';
const GEMINI_ROUTE    = '/api/gemini';

const SUGGESTED_QUESTIONS = [
  'What are my top overspending categories this month?',
  'Give me a 30-day plan to improve my savings.',
  'Which budget categories should I cut first?',
  'How can I improve my monthly cash flow?',
  'Flag any risky spending patterns in my transactions.',
  'Create a realistic budget for next month based on my data.',
];

function currentMonthRange() {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { first, last };
}

function buildSnapshot(transactions, budgets, spent) {
  const income   = transactions.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount), 0);
  const expenses = transactions.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount), 0);

  const byCategory = {};
  for (const t of transactions.filter(t => t.type === 'Expense')) {
    byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount);
  }

  const budgetVsActual = Object.entries(budgets)
    .filter(([, limit]) => limit)
    .map(([cat, limit]) => ({
      category: cat,
      budget: Number(limit),
      actual: spent[cat] || 0,
      variance: Number(limit) - (spent[cat] || 0),
    }));

  const recent = [...transactions].slice(0, 20).map(t => ({
    date:        t.date,
    type:        t.type,
    category:    t.category,
    amount:      Number(t.amount),
    description: t.description,
  }));

  return {
    summary: {
      total_income:    income,
      total_expenses:  expenses,
      net_balance:     income - expenses,
    },
    expenses_by_category: byCategory,
    budget_vs_actual:     budgetVsActual,
    recent_transactions:  recent,
  };
}

function buildSystemPrompt(snapshot) {
  return (
    'You are a personal finance chatbot embedded in a budgeting app. ' +
    'Use the provided financial data as source of truth. Give practical, safe, non-legal, ' +
    'non-guaranteed guidance. Be specific and concise.\n\n' +
    'When useful, include:\n' +
    '- Quick diagnosis\n' +
    '- What to change this week\n' +
    '- Numeric targets\n' +
    '- One caution\n\n' +
    'App financial data (JSON):\n' +
    JSON.stringify(snapshot, null, 2)
  );
}

export default function AiAdvisor({ userId }) {
  // --- Financial data ---
  const [transactions, setTransactions] = useState([]);
  const [budgets,      setBudgets]      = useState({});
  const [spent,        setSpent]        = useState({});
  const [dataLoading,  setDataLoading]  = useState(true);

  // --- Provider + chat state ---
  const [provider,    setProvider]    = useState('gemini'); // 'gemini' | 'ollama'
  const [ollamaModel, setOllamaModel] = useState('llama3.2');
  const [messages,    setMessages]    = useState([]);
  const [input,       setInput]       = useState('');
  const [thinking,    setThinking]    = useState(false);
  const [aiError,     setAiError]     = useState(null);
  const chatEndRef = useRef(null);

  // --- History state ---
  const [entries,        setEntries]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expanded,       setExpanded]       = useState(null);

  // Load transactions + budgets
  useEffect(() => {
    let active = true;
    const { first, last } = currentMonthRange();

    async function load() {
      const [txRes, budgetRes, spentRes] = await Promise.all([
        supabase.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
        supabase.from('budgets').select('*').eq('user_id', userId),
        supabase.from('transactions').select('category, amount')
          .eq('user_id', userId).eq('type', 'Expense').gte('date', first).lte('date', last),
      ]);
      if (!active) return;

      setTransactions(txRes.data || []);

      const budgetMap = {};
      for (const b of (budgetRes.data || [])) budgetMap[b.category] = b.monthly_limit;
      setBudgets(budgetMap);

      const spentMap = {};
      for (const t of (spentRes.data || [])) spentMap[t.category] = (spentMap[t.category] || 0) + Number(t.amount);
      setSpent(spentMap);

      setDataLoading(false);
    }

    load();
    return () => { active = false; };
  }, [userId]);

  // Load advice history
  useEffect(() => {
    let active = true;
    async function loadHistory() {
      const { data } = await supabase
        .from('ai_advice_history')
        .select('*')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false });
      if (active) { setEntries(data || []); setHistoryLoading(false); }
    }
    loadHistory();
    return () => { active = false; };
  }, [userId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || thinking) return;
    if (transactions.length === 0) {
      setAiError('Add at least one transaction first so the AI has data to work with.');
      return;
    }

    setAiError(null);
    const userMsg = { role: 'user', content: trimmed };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput('');
    setThinking(true);

    const snapshot     = buildSnapshot(transactions, budgets, spent);
    const systemPrompt = buildSystemPrompt(snapshot);
    const modelLabel   = provider === 'gemini' ? 'gemini-1.5-flash' : ollamaModel;

    let reply = '';
    try {
      if (provider === 'gemini') {
        const res = await fetch(GEMINI_ROUTE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: updatedMessages, systemPrompt }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
        reply = data.reply || 'No response returned.';
      } else {
        const res = await fetch(OLLAMA_CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: ollamaModel,
            messages: [{ role: 'system', content: systemPrompt }, ...updatedMessages],
            stream: false,
            options: { temperature: 0.3 },
          }),
        });
        if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
        const data = await res.json();
        reply = data?.message?.content || 'No response returned.';
      }

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      const { data: saved } = await supabase
        .from('ai_advice_history')
        .insert({
          user_id:     userId,
          recorded_at: new Date().toISOString(),
          model:       modelLabel,
          focus:       trimmed.slice(0, 200),
          advice:      reply.trim(),
        })
        .select().single();
      if (saved) setEntries(prev => [saved, ...prev]);

    } catch (err) {
      if (provider === 'ollama' && (err.message === 'Failed to fetch' || err.name === 'TypeError')) {
        setAiError(
          'Cannot reach Ollama at localhost:11434.\n\n' +
          'Make sure Ollama is running with CORS enabled:\n\n' +
          '  Windows PowerShell:\n' +
          '  $env:OLLAMA_ORIGINS="*"; ollama serve\n\n' +
          '  Mac / Linux:\n' +
          '  OLLAMA_ORIGINS="*" ollama serve\n\n' +
          'Or switch to Gemini (Cloud) above — no install needed.'
        );
      } else {
        setAiError(`AI error: ${err.message}`);
      }
    } finally {
      setThinking(false);
    }
  };

  const handleSubmit = (e) => { e.preventDefault(); sendMessage(input); };
  const handleNewChat = () => { setMessages([]); setAiError(null); setInput(''); };
  const handleProviderSwitch = (p) => { setProvider(p); setMessages([]); setAiError(null); setInput(''); };

  return (
    <div className="tab-content">

      {/* ── AI Chat Panel ── */}
      <article className="panel form-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">AI Financial Advisor</p>
            <h2>Chat with your data</h2>
          </div>
          <button className="ai-new-chat-btn" onClick={handleNewChat}>New chat</button>
        </div>

        {/* Provider toggle */}
        <div className="provider-toggle-wrap">
          <button
            className={`provider-btn${provider === 'gemini' ? ' provider-btn-active' : ''}`}
            onClick={() => handleProviderSwitch('gemini')}
          >
            <span className="provider-icon">☁️</span>
            <span>
              <strong>Gemini</strong>
              <span className="provider-note"> Cloud · Free tier · Works everywhere</span>
            </span>
          </button>
          <button
            className={`provider-btn${provider === 'ollama' ? ' provider-btn-active' : ''}`}
            onClick={() => handleProviderSwitch('ollama')}
          >
            <span className="provider-icon">🖥️</span>
            <span>
              <strong>Ollama</strong>
              <span className="provider-note"> Local · Fully private · Requires install</span>
            </span>
          </button>
        </div>

        {provider === 'ollama' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <label className="form-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>Ollama model</label>
            <input
              className="form-input"
              style={{ width: 180 }}
              value={ollamaModel}
              onChange={e => setOllamaModel(e.target.value)}
              placeholder="llama3.2"
            />
          </div>
        )}

        {provider === 'gemini' && (
          <div className="provider-info provider-info-gemini">
            <strong>Gemini free tier</strong> — works on any device, no install needed.
            Requires a free <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio API key</a> added to your Vercel project as <code>GEMINI_API_KEY</code>.
          </div>
        )}
        {provider === 'ollama' && (
          <div className="provider-info provider-info-ollama">
            <strong>Ollama (local)</strong> — runs 100% on this device, completely private.
            Requires <a href="https://ollama.com" target="_blank" rel="noreferrer">Ollama</a> installed and running with <code>$env:OLLAMA_ORIGINS="*"; ollama serve</code>
          </div>
        )}

        {dataLoading ? (
          <p className="table-note">Loading your financial data…</p>
        ) : transactions.length === 0 ? (
          <p className="table-note ai-warn">No transactions found. Add some on the Transactions tab so the AI has real data to work with.</p>
        ) : (
          <p className="table-note">AI has access to <strong>{transactions.length}</strong> transaction{transactions.length !== 1 ? 's' : ''} and your current budget data.</p>
        )}

        {messages.length === 0 && !dataLoading && transactions.length > 0 && (
          <div className="suggested-questions">
            <p className="form-label" style={{ marginBottom: 8 }}>Suggested questions — click to send</p>
            <div className="suggested-questions-grid">
              {SUGGESTED_QUESTIONS.map(q => (
                <button key={q} className="suggested-btn" onClick={() => sendMessage(q)} disabled={thinking}>{q}</button>
              ))}
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
                <span className="chat-speaker">{m.role === 'user' ? 'You' : 'AI'}</span>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.content}</p>
              </div>
            ))}
            {thinking && (
              <div className="chat-bubble chat-bubble-assistant chat-bubble-thinking">
                <span className="chat-speaker">AI</span>
                <p style={{ margin: 0 }}>Thinking…</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {aiError && (
          <div className="ai-error-box">
            <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{aiError}</pre>
          </div>
        )}

        <form onSubmit={handleSubmit} className="chat-input-row" style={{ marginTop: 16 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your budget, spending, savings…"
            disabled={thinking}
          />
          <button className="primary-btn" type="submit" style={{ marginTop: 0, whiteSpace: 'nowrap' }}
            disabled={thinking || !input.trim()}>
            {thinking ? 'Sending…' : 'Send'}
          </button>
        </form>
      </article>

      {/* ── Advice History Panel ── */}
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Saved guidance</p>
            <h2>Advice history</h2>
          </div>
        </div>
        {historyLoading ? (
          <p className="table-note">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="table-note">No advice saved yet. Start a chat above — responses are saved automatically.</p>
        ) : (
          <div className="advice-stack-full">
            {entries.map(entry => (
              <div key={entry.id} className="advice-card-full">
                <div className="advice-card-header">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="advice-focus">{entry.focus || '(no topic)'}</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {entry.model || '—'} · {new Date(entry.recorded_at).toLocaleString()}
                    </p>
                  </div>
                  <button className="expand-btn" onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                    {expanded === entry.id ? 'Collapse ▲' : 'Read ▼'}
                  </button>
                </div>
                {expanded !== entry.id && (
                  <p className="advice-preview">{entry.advice.slice(0, 160)}{entry.advice.length > 160 ? '…' : ''}</p>
                )}
                {expanded === entry.id && (
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.7 }}>{entry.advice}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </article>

    </div>
  );
}

    const payload = {
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...updatedMessages],
      stream: false,
      options: { temperature: 0.3 },
    };

    try {
      const res = await fetch(OLLAMA_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);

      const data = await res.json();
      const reply = data?.message?.content || 'No response returned by model.';

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      // Auto-save to Supabase
      const { data: saved } = await supabase
        .from('ai_advice_history')
        .insert({
          user_id:     userId,
          recorded_at: new Date().toISOString(),
          model,
          focus:       trimmed.slice(0, 200),
          advice:      reply.trim(),
        })
        .select()
        .single();

      if (saved) setEntries(prev => [saved, ...prev]);

    } catch (err) {
      if (err.message === 'Failed to fetch' || err.name === 'TypeError') {
        setAiError(
          'Cannot reach Ollama at localhost:11434.\n\n' +
          'Fix: Ollama needs CORS enabled. Open a terminal and run:\n\n' +
          '  Windows (PowerShell):\n' +
          '  $env:OLLAMA_ORIGINS="*"; ollama serve\n\n' +
          '  Mac / Linux:\n' +
          '  OLLAMA_ORIGINS="*" ollama serve\n\n' +
          'Then refresh this page and try again.'
        );
      } else {
        setAiError(`AI error: ${err.message}`);
      }
    } finally {
      setThinking(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleNewChat = () => {
    setMessages([]);
    setAiError(null);
    setInput('');
  };

  return (
    <div className="tab-content">

      {/* ── AI Chat Panel ── */}
      <article className="panel form-panel">

        <div className="panel-heading">
          <div>
            <p className="eyebrow">AI Financial Advisor</p>
            <h2>Chat with your data</h2>
          </div>
          <div className="ai-header-controls">
            <label className="form-label" style={{ margin: 0 }}>Model</label>
            <input
              className="form-input"
              style={{ width: 160 }}
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="llama3.2"
            />
            <button className="ai-new-chat-btn" onClick={handleNewChat}>New chat</button>
          </div>
        </div>

        {/* Data status */}
        {dataLoading ? (
          <p className="table-note">Loading your financial data…</p>
        ) : transactions.length === 0 ? (
          <p className="table-note ai-warn">
            No transactions found. Add some on the Transactions tab so the AI has real data to work with.
          </p>
        ) : (
          <p className="table-note">
            AI has access to <strong>{transactions.length}</strong> transaction{transactions.length !== 1 ? 's' : ''} and your current budget data.
          </p>
        )}

        {/* Suggested questions — shown only at start of a new chat */}
        {messages.length === 0 && !dataLoading && transactions.length > 0 && (
          <div className="suggested-questions">
            <p className="form-label" style={{ marginBottom: 8 }}>Suggested questions — click to send</p>
            <div className="suggested-questions-grid">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  className="suggested-btn"
                  onClick={() => sendMessage(q)}
                  disabled={thinking}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.length > 0 && (
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>
                <span className="chat-speaker">{m.role === 'user' ? 'You' : 'AI'}</span>
                <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.content}</p>
              </div>
            ))}
            {thinking && (
              <div className="chat-bubble chat-bubble-assistant chat-bubble-thinking">
                <span className="chat-speaker">AI</span>
                <p style={{ margin: 0 }}>Thinking…</p>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Error */}
        {aiError && (
          <div className="ai-error-box">
            <pre style={{ margin: 0, fontFamily: 'inherit', whiteSpace: 'pre-wrap' }}>{aiError}</pre>
          </div>
        )}

        {/* Input */}
        <form onSubmit={handleSubmit} className="chat-input-row" style={{ marginTop: 16 }}>
          <input
            className="form-input"
            style={{ flex: 1 }}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your budget, spending, savings…"
            disabled={thinking}
          />
          <button
            className="primary-btn"
            type="submit"
            style={{ marginTop: 0, whiteSpace: 'nowrap' }}
            disabled={thinking || !input.trim()}
          >
            {thinking ? 'Sending…' : 'Send'}
          </button>
        </form>

      </article>

      {/* ── Advice History Panel ── */}
      <article className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Saved guidance</p>
            <h2>Advice history</h2>
          </div>
        </div>

        {historyLoading ? (
          <p className="table-note">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="table-note">No advice saved yet. Start a chat above — responses are saved automatically.</p>
        ) : (
          <div className="advice-stack-full">
            {entries.map(entry => (
              <div key={entry.id} className="advice-card-full">
                <div className="advice-card-header">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p className="advice-focus">{entry.focus || '(no topic)'}</p>
                    <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--muted)' }}>
                      {entry.model || '—'} · {new Date(entry.recorded_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    className="expand-btn"
                    onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                  >
                    {expanded === entry.id ? 'Collapse ▲' : 'Read ▼'}
                  </button>
                </div>
                {expanded !== entry.id && (
                  <p className="advice-preview">
                    {entry.advice.slice(0, 160)}{entry.advice.length > 160 ? '…' : ''}
                  </p>
                )}
                {expanded === entry.id && (
                  <p style={{ whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.7 }}>{entry.advice}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </article>

    </div>
  );
}
