// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TextBoxSheet, { stepTextSize, textBoxStyleFor } from '../src/ui/TextBoxSheet';
import { withAlpha } from '../src/editor/shapes/renderText';
import { DEFAULT_STYLE, type Annotation } from '../src/domain/types';
import { STRINGS } from '../src/ui/strings';

afterEach(cleanup);

const START = { ...DEFAULT_STYLE, strokeColor: '#FFFFFF', fillColor: '#0B0E12', fillAlpha: 0.85 };

function open(onCommit = vi.fn(), onCancel = vi.fn()) {
  render(
    createElement(TextBoxSheet, { mode: 'new', initialText: '', initialStyle: START, onCommit, onCancel }),
  );
  return { onCommit, onCancel };
}

describe('D160 — the text-box editor', () => {
  it('commits multi-line text with the chosen size, bold, colours and opacity', () => {
    const { onCommit } = open();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Header\nsecond line' } });
    fireEvent.click(screen.getByTestId('text-box-size-L'));
    fireEvent.click(screen.getByLabelText(STRINGS.textBox.larger));
    fireEvent.click(screen.getByLabelText(STRINGS.textBox.bold));
    fireEvent.click(screen.getByTestId('text-box-color-FFD400'));
    fireEvent.click(screen.getByTestId('text-box-bg-123B6B'));
    fireEvent.change(screen.getByLabelText(/Background opacity/), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('text-box-done'));
    expect(onCommit).toHaveBeenCalledWith('Header\nsecond line', {
      ...START,
      fontSizeMu: 30,
      bold: true,
      strokeColor: '#FFD400',
      fillColor: '#123B6B',
      fillAlpha: 0.4,
    });
  });

  it('«No background» clears the box and disables the opacity slider', () => {
    const { onCommit } = open();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('text-box-bg-none'));
    expect((screen.getByLabelText(/Background opacity/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('text-box-done'));
    expect(onCommit.mock.calls[0][1].fillColor).toBeNull();
  });

  it('Done is disabled for blank text; Esc cancels; Ctrl+Enter commits', () => {
    const { onCommit, onCancel } = open();
    expect((screen.getByTestId('text-box-done') as HTMLButtonElement).disabled).toBe(true);
    const box = screen.getByRole('textbox');
    fireEvent.change(box, { target: { value: 'ok' } });
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('steps size finely when small and coarsely when large, within 8..120', () => {
    expect(stepTextSize(18, 1)).toBe(19);
    expect(stepTextSize(28, 1)).toBe(30);
    expect(stepTextSize(60, -1)).toBe(56);
    expect(stepTextSize(8, -1)).toBe(8);
    expect(stepTextSize(120, 1)).toBe(120);
  });

  it('translates an older note to the nearest box so editing keeps its look', () => {
    const note = (background: 'auto' | 'none' | 'box'): Annotation =>
      ({
        id: 'n',
        type: 'text',
        geometry: { kind: 'text', at: { x: 0, y: 0 }, text: 'a', background },
        style: { ...DEFAULT_STYLE },
      }) as unknown as Annotation;
    expect(textBoxStyleFor(note('auto'))).toMatchObject({ strokeColor: '#FFFFFF', fillColor: '#0B0E12', fillAlpha: 0.85 });
    expect(textBoxStyleFor(note('none')).fillColor).toBeNull();
    expect(textBoxStyleFor(note('box'))).toEqual(DEFAULT_STYLE);
  });

  it('withAlpha turns a hex into rgba and clamps the alpha', () => {
    expect(withAlpha('#0B0E12', 0.5)).toBe('rgba(11,14,18,0.5)');
    expect(withAlpha('#FFFFFF', 2)).toBe('rgba(255,255,255,1)');
    expect(withAlpha('red', 0.5)).toBe('red');
  });
});
