import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import Overview from './components/Overview';
import Transactions from './components/Transactions';
import Budget from './components/Budget';
import AdviceHistory from './components/AdviceHistory';
import './App.css';

const TABS = ['Overview', 'Transactions', 'Budget', 'AI Advice'];

function App() {
  const [session, setSession] = useState(undefined);
  const [activeTab, setActiveTab] = useState('Overview');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return <div className="app-loading" aria-label="Loading personal finance dashboard">Loading…</div>;
  }

  if (!session) {
    return <Auth />;
  }

  const userId = session.user.id;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <p className="eyebrow">Personal Finance</p>
            <strong className="app-brand-name">Dashboard</strong>
          </div>
          <nav className="tab-nav" aria-label="Dashboard sections">
            {TABS.map((tab) => (
              <button
                key={tab}
                className={`tab-btn${activeTab === tab ? ' tab-btn-active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>
          <div className="app-header-actions">
            <span className="app-user-email">{session.user.email}</span>
            <button className="sign-out-btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="app-content">
        {activeTab === 'Overview'      && <Overview      userId={userId} />}
        {activeTab === 'Transactions'  && <Transactions  userId={userId} />}
        {activeTab === 'Budget'        && <Budget        userId={userId} />}
        {activeTab === 'AI Advice'     && <AdviceHistory userId={userId} />}
      </main>
    </div>
  );
}

export default App;
