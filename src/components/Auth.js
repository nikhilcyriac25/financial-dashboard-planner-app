import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage({ type: 'error', text: error.message });
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage({ type: 'error', text: error.message });
      } else {
        setMessage({
          type: 'success',
          text: 'Account created! Check your email for a confirmation link, then sign in.',
        });
      }
    }

    setLoading(false);
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login');
    setMessage(null);
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-hero">
          <p className="eyebrow">Personal Finance</p>
          <h1 className="auth-title">Dashboard</h1>
          <p className="auth-subtitle">Track every dollar. Stay ahead of every goal.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <label className="form-label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            className="form-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />

          <label className="form-label" htmlFor="auth-password">Password</label>
          <input
            id="auth-password"
            className="form-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            minLength={6}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {message && (
            <p className={`auth-message ${message.type === 'error' ? 'auth-message-error' : 'auth-message-success'}`}>
              {message.text}
            </p>
          )}

          <button className="auth-submit-btn" type="submit" disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        <p className="auth-toggle">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button className="auth-toggle-btn" type="button" onClick={switchMode}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
