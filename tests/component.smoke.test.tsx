import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

afterEach(cleanup);

// Proves the `jsdom` Vitest project runs and React 19 + Testing Library mount.
describe('scaffold jsdom harness', () => {
  it('renders the placeholder screen', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole('heading', { name: /field measure/i })).toBeTruthy();
    expect(screen.getByText(/scaffold/i)).toBeTruthy();

    // Exercises @testing-library/user-event (its dependency stays load-bearing).
    await user.tab();
  });
});
