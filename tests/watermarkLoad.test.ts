/**
 * tests/watermarkLoad.test.ts: `loadExportWatermarkImage` and its once-per-session cache.
 *
 * The loader cached the PROMISE, so a single failed fetch (offline blip, service worker not
 * ready, a 404 page) was cached too: every later export in the session re-used the rejection
 * and went out without the VANGARDE mark, with nothing to tell the crew why. It also never
 * looked at `res.ok`, so an error page was handed to the image decoder as if it were the logo.
 *
 * The module-level cache survives between tests, so each test loads a FRESH copy of the module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const bitmap = { width: 1911, height: 1039, close: () => {} } as unknown as ImageBitmap;

function ok(): Response {
  return { ok: true, status: 200, blob: async () => new Blob(['png-bytes']) } as unknown as Response;
}

function notFound(): Response {
  return { ok: false, status: 404, blob: async () => new Blob(['<html>404</html>']) } as unknown as Response;
}

async function freshLoader(): Promise<typeof import('../src/export/watermark').loadExportWatermarkImage> {
  vi.resetModules();
  return (await import('../src/export/watermark')).loadExportWatermarkImage;
}

beforeEach(() => {
  // Node has no `createImageBitmap`; whatever it is handed, it decodes "successfully", so only
  // the loader's own checks can reject.
  vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadExportWatermarkImage', () => {
  it('a failed first load does not stick: the next export retries and gets the mark', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const load = await freshLoader();

    await expect(load()).rejects.toThrow('Failed to fetch');
    await expect(load()).resolves.toBe(bitmap);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an HTTP error page is a failure, not a logo, and is retried too', async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(notFound())
      .mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const load = await freshLoader();

    await expect(load()).rejects.toThrow(/404/);
    // The 404 body must never have reached the decoder.
    expect(vi.mocked(createImageBitmap)).not.toHaveBeenCalled();
    await expect(load()).resolves.toBe(bitmap);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a decode failure is cleared as well', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('corrupt image'));
    const load = await freshLoader();

    await expect(load()).rejects.toThrow('corrupt image');
    await expect(load()).resolves.toBe(bitmap);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('a success is still cached: every sheet of a run shares one fetch and one bitmap', async () => {
    const fetchMock = vi.fn<() => Promise<Response>>(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
    const load = await freshLoader();

    const [a, b] = await Promise.all([load(), load()]);
    const c = await load();

    expect(a).toBe(bitmap);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
