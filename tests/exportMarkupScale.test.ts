import { describe, expect, it } from 'vitest';
import { EXPORT_REFERENCE_VIEW_PX, exportMarkupScale } from '../src/export/renderStage';

describe('D154 — exports draw marks at the size the fitted editor shows them', () => {
  it('is 1 for a photo no larger than the reference view (the old behaviour)', () => {
    expect(exportMarkupScale(1024, 768)).toBe(1);
    expect(exportMarkupScale(EXPORT_REFERENCE_VIEW_PX, 900)).toBe(1);
  });
  it('grows with the long edge, so a 4K photo gets 3x marks', () => {
    expect(exportMarkupScale(3840, 2160)).toBeCloseTo(3);
    expect(exportMarkupScale(2160, 3840)).toBeCloseTo(3);
  });
});
