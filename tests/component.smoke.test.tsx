import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

afterEach(cleanup);

// Proves the `jsdom` Vitest project runs and React 19 + Testing Library mount.
// Slice 0.3 replaced the scaffold screen: with no projects folder stored (and no
// IndexedDB in jsdom) the shell boots into first run rather than crashing.
describe('scaffold jsdom harness', () => {
  it('boots the app shell into first run', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /which hand do you write with/i }),
    ).toBeTruthy();

    // Exercises @testing-library/user-event (its dependency stays load-bearing).
    await user.tab();
  });
});
