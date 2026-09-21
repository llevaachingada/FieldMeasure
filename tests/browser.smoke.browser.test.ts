import { describe, expect, it } from 'vitest';

// Proves the `browser` Vitest project has a REAL canvas. jsdom's canvas is a stub:
// `getContext` returns null-ish and `toDataURL` returns a non-image stub, so this
// assertion genuinely fails there. Anything touching a Konva.Stage belongs here.
describe('scaffold browser harness', () => {
  it('produces a real PNG data URL from a canvas', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;

    const ctx = canvas.getContext('2d');
    expect(ctx).not.toBeNull();
    ctx!.fillStyle = '#1a1a1a';
    ctx!.fillRect(0, 0, 2, 2);

    const dataUrl = canvas.toDataURL();
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });
});
