import { test, expect } from '@playwright/test';

/**
 * Checkpoint C3 — device camera capabilities (slice 0.2).
 *
 * Measures `enumerateDevices()` + `getUserMedia` on the machine it runs on and
 * RECORDS the result (it never gates the slice — every outcome has a designed
 * response per build spec §21.7). On a real Surface this yields the true max
 * resolution + torch/flip availability; on a dev machine / CI with no camera it
 * logs "no camera" and the provisional record feeds slice 1.4.
 *
 * Read the logged lines and transcribe them into docs/DECISIONS.md (C3 format)
 * at slice 0.2 merge. If no Surface is available, record PROVISIONAL and add
 * "re-measure C3 device caps" to docs/HARDWARE-TEST-CHECKLIST.md.
 */
test('records device camera capabilities', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  const devices = await page.evaluate(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return { available: false, reason: 'no mediaDevices API (not a secure context?)', videoinput: [] };
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    return {
      available: true,
      videoinput: all
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || '(label hidden)' })),
    };
  });

  testInfo.attach('enumerateDevices', {
    body: JSON.stringify(devices, null, 2),
    contentType: 'application/json',
  });
  console.log('[C3] enumerateDevices:', JSON.stringify(devices));

  // Attempt getUserMedia with increasing resolution constraints; capture what the
  // track actually delivers (track.getSettings()), never the advertised constraint.
  const attempt = async (constraint: { ideal?: number; exact?: number }) => {
    return page.evaluate(async (c) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: c, height: c },
          audio: false,
        });
        const track = stream.getVideoTracks()[0];
        const settings = track.getSettings();
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        const result = {
          ok: true,
          delivered: {
            width: settings.width ?? null,
            height: settings.height ?? null,
          },
          torch: (caps as { torch?: boolean }).torch ?? null,
          facingMode: (settings as { facingMode?: string }).facingMode ?? null,
        };
        track.stop();
        return result;
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }, constraint);
  };

  // Probe a ladder of increasing widths; the last successful, largest delivery is the cap.
  const results: Array<Record<string, unknown>> = [];
  for (const ideal of [1920, 3840, 7680]) {
    results.push(await attempt({ ideal }));
  }

  testInfo.attach('getUserMedia ladder', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  console.log('[C3] getUserMedia ladder:', JSON.stringify(results));

  // C3 cannot fail the slice — but it must RUN. Assert the enumeration ran; the
  // meaningful value (max width×height + torch/flip) is the logged ladder above.
  expect(devices.available === true || devices.available === false).toBe(true);
});
