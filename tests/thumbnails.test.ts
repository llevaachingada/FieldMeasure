/**
 * tests/thumbnails.test.ts — the debounced thumbnail scheduler (slice 1.3, §7.3).
 *
 * The scheduler's generate/render half needs a canvas and a worker (covered in
 * `thumbnails.browser.test.ts`); its timing contract is pure and runs here:
 * regenerate 3 s after the LAST edit, one generate+write per burst, and a failure
 * never wedges the chain. Timers are faked (no new dependency).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createThumbnailScheduler,
  THUMB_DEBOUNCE_MS,
} from '../src/media/thumbnails';

afterEach(() => {
  vi.useRealTimers();
});

const blob = (tag: string): Blob => new Blob([tag]);

/** Let the async generate/write microtasks settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('createThumbnailScheduler', () => {
  it('coalesces a burst into ONE generate+write 3 s after the last edit', async () => {
    vi.useFakeTimers();
    const generate = vi.fn(async (_photo: Blob) => blob('thumb'));
    const write = vi.fn(async (_blob: Blob) => {});
    const scheduler = createThumbnailScheduler({ write, generate });

    for (let i = 0; i < 10; i += 1) scheduler.schedule(blob(`edit-${i}`));
    expect(scheduler.pending).toBe(true);
    expect(generate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(THUMB_DEBOUNCE_MS - 1);
    expect(generate).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledTimes(1);
    // The newest photo is the one generated.
    expect(await (generate.mock.calls[0][0] as Blob).text()).toBe('edit-9');
    expect(scheduler.pending).toBe(false);
  });

  it('the window restarts on every edit (3 s after the LAST one)', async () => {
    vi.useFakeTimers();
    const generate = vi.fn(async (_photo: Blob) => blob('thumb'));
    const write = vi.fn(async () => {});
    const scheduler = createThumbnailScheduler({ write, generate });

    scheduler.schedule(blob('edit-1'));
    await vi.advanceTimersByTimeAsync(2000); // 2 s into the first window
    scheduler.schedule(blob('edit-2')); // restarts the clock
    await vi.advanceTimersByTimeAsync(THUMB_DEBOUNCE_MS - 1);
    expect(generate).not.toHaveBeenCalled(); // 2 s + 3 s − 1 ms from edit-1, < 3 s from edit-2
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await (generate.mock.calls[0][0] as Blob).text()).toBe('edit-2');
  });

  it('flush() runs the pending generation immediately and resolves after the write', async () => {
    vi.useFakeTimers();
    let writeResolved = false;
    const generate = vi.fn(async () => blob('thumb'));
    const write = vi.fn(async () => {
      writeResolved = true;
    });
    const scheduler = createThumbnailScheduler({ write, generate });
    scheduler.schedule(blob('edit'));

    await scheduler.flush();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(writeResolved).toBe(true);
    expect(scheduler.pending).toBe(false);
  });

  it('flush() with nothing pending is a no-op', async () => {
    vi.useFakeTimers();
    const generate = vi.fn(async () => blob('thumb'));
    const write = vi.fn(async () => {});
    const scheduler = createThumbnailScheduler({ write, generate });
    await scheduler.flush();
    expect(generate).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('cancel() drops the pending edit', async () => {
    vi.useFakeTimers();
    const generate = vi.fn(async () => blob('thumb'));
    const write = vi.fn(async () => {});
    const scheduler = createThumbnailScheduler({ write, generate });
    scheduler.schedule(blob('edit'));
    scheduler.cancel();
    expect(scheduler.pending).toBe(false);
    await vi.advanceTimersByTimeAsync(THUMB_DEBOUNCE_MS * 2);
    expect(generate).not.toHaveBeenCalled();
  });

  it('a failing generate/write does not wedge the chain', async () => {
    vi.useFakeTimers();
    const generate = vi
      .fn<() => Promise<Blob>>()
      .mockRejectedValueOnce(new Error('decode failed'))
      .mockResolvedValueOnce(blob('thumb'));
    const write = vi.fn(async () => {});
    const scheduler = createThumbnailScheduler({ write, generate });

    scheduler.schedule(blob('edit-1'));
    await vi.advanceTimersByTimeAsync(THUMB_DEBOUNCE_MS);
    await settle();
    expect(generate).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();

    scheduler.schedule(blob('edit-2'));
    await vi.advanceTimersByTimeAsync(THUMB_DEBOUNCE_MS);
    await settle();
    expect(generate).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('uses the 3 s default from §7.3', () => {
    expect(THUMB_DEBOUNCE_MS).toBe(3000);
  });
});
