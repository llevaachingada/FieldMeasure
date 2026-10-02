/** D152: the persistent Help button opens the user guide in a modal and closes cleanly. */
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HelpButton from '../src/ui/HelpButton';
import { STRINGS } from '../src/ui/strings';

afterEach(cleanup);

describe('HelpButton (D152)', () => {
  it('opens a labelled modal with every guide section, and Esc closes it and returns focus', async () => {
    const user = userEvent.setup();
    render(createElement(HelpButton));
    const trigger = screen.getByRole('button', { name: STRINGS.help.button });
    await user.click(trigger);

    const dialog = screen.getByRole('dialog', { name: STRINGS.help.title });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    for (const section of Object.values(STRINGS.help.sections)) {
      expect(screen.getByRole('heading', { name: section.heading })).toBeTruthy();
    }
    // Focus starts on Close so a keyboard user can dismiss it at once.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: STRINGS.help.close }));

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('the Close button closes it', async () => {
    const user = userEvent.setup();
    render(createElement(HelpButton));
    await user.click(screen.getByRole('button', { name: STRINGS.help.button }));
    await user.click(screen.getByRole('button', { name: STRINGS.help.close }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
