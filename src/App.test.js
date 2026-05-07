import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

jest.mock('./supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve(),
    },
  },
}));

test('renders login form when no session exists', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
  });
});
