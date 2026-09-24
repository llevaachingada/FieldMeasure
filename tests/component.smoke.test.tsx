import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../src/App';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Proves the `jsdom` Vitest project runs and React 19 + Testing Library mount.
// Slice 0.3 replaced the scaffold screen: with no projects folder stored (and no
// IndexedDB in jsdom) the shell boots into first run rather than crashing.
describe('scaffold jsdom harness', () => {
  it('boots the app shell into first run', async () => {
    const user = userEvent.setup();
    // D139: a browser with no folder picker boots into the unsupported notice instead; the real
    // target (Edge/Chromium) has one, so the smoke test boots as that browser would.
    vi.stubGlobal('showDirectoryPicker', async () => {
      throw new DOMException('The user aborted a request.', 'AbortError');
    });
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: /which hand do you write with/i }),
    ).toBeTruthy();

    // Exercises @testing-library/user-event (its dependency stays load-bearing).
    await user.tab();
  });
});
