# Investigation — the torch (flashlight) button and the photo capture/import path

**Requested by:** owner · **Date:** 2026-09-22 · **Type:** read-only investigation (no code changed)
**Scope:** does the ⚡ Torch toggle actually fire the camera LED on a Surface tablet, and is
photo saving/import complete?

All claims below were verified by reading the shipped source and by executing the device-caps probe on
the Windows build machine. Nothing here changes product behaviour; the two candidate items in §3 are
**not numbered decisions** — see the note at the end of this file.

---

## 1. The torch button — what the code actually does

The button is fully wired to the real hardware API; it is not a placeholder.

| Step | Location | What happens |
|---|---|---|
| Toggle | `src/ui/CameraFlow.tsx:860-870` | ⚡ button (`aria-pressed={torchOn}`, `aria-label={STRINGS.a11y.torch}`) → `toggleTorch` |
| Handler | `src/ui/CameraFlow.tsx:535-539` | flips `torchOn`, then `void applyAdvanced({ torch: next })` |
| Hardware call | `src/ui/CameraFlow.tsx:458-466` | `MediaStreamTrack.applyConstraints({ advanced: [{ torch: … }] })` on the live video track — **this is the standard Chromium mechanism for the physical LED** |
| Capability probe | `src/ui/CameraFlow.tsx:395-396` | `track.getCapabilities()` → `setCaps({ torch: !!capabilities.torch, … })`, read once per stream |
| Gating | `src/ui/CameraFlow.tsx:565` | only the **zoom chips** are capability-gated (`zoomSupported`); the torch button is always enabled |

`applyAdvanced` deliberately swallows a rejected constraint ("the viewfinder must never break over a
hint"), which is correct for a best-effort hardware hint.

### Can it light a Surface's LED?

**Not from a Windows browser, in general.** Both `getUserMedia` and the `torch` advanced constraint are
gated by the platform camera stack; on Windows (Media Foundation) tablets the browser does not expose a
torch capability, so `getCapabilities().torch` is absent and `applyConstraints({ torch })` is a no-op
that rejects. The toggle therefore cannot drive the LED on the target hardware — this is a **platform
limitation, not a code defect**.

Evidence from this machine (Playwright chromium, no usable camera in that context):

```
[C3] enumerateDevices: {"available":true,"videoinput":[{"deviceId":"","label":"(label hidden)"}]}
[C3] getUserMedia ladder: [{"ok":false,"error":"NotSupportedError: Not supported"}, …]
```

That matches the provisional C3 record in `docs/DECISIONS.md` ("No usable camera — so no max resolution
or torch/flip data could be read"). Whether the owner's Surface Go exposes `torch` at all is exactly
what the `[Surface]` hardware rows exist to answer — it **must be measured on the device, never assumed**.

---

## 2. Photo saving and import — complete in code

Both capture and import feed the same atomic write path; nothing is missing at the code level.

- **Capture:** shutter → `takePhoto` (`CameraFlow.tsx:569`) → review (`Retake · Rotate · Use photo`) →
  `usePhoto` → `commit` (`CameraFlow.tsx:605-642`): reads EXIF capture time *before* normalize,
  bakes rotation, `normalizeImage`, then `addSheetFromPhoto` from the frozen `src/fs/sheetIntake.ts`
  write path (tmp → close → `move()` under the per-project Web Lock — non-negotiable #3), then
  schedules the 640×480 `thumb.jpg` atomically.
- **Failure:** `write: 'failed'` → Retry + «Save a copy…» download fallback (`CameraFlow.tsx:636-663`).
  A field photo is never trapped.
- **Import:** `handleImport` (`CameraFlow.tsx:665-671`) takes a picked file through the **same** `commit`.
  The editor-side entry is `EditorLayout.tsx:647 onImportFile → importTriggerRef`.
- **Windows Camera bridge:** `openWindowsCamera` (`CameraFlow.tsx:673-681`) launches `ms-camera:` for
  the high-res path when the web camera caps out.

What remains is **on-glass verification** (real camera + real FSA folder), already tracked as `[Surface]`
rows in `docs/HARDWARE-TEST-CHECKLIST.md` — never faked, never silently skipped.

---

## 3. Two candidate items (NOT numbered decisions)

1. **The torch toggle can report success when nothing happened.** If `applyConstraints` rejects (the
   Windows case), `torchOn` still flips to "on": the button shows active with no LED. An honest version
   reverts the toggle when the hardware rejects the constraint (and/or disables it from
   `caps.torch === false` with the approved tooltip). `applyAdvanced` currently returns `void`, so
   reporting the outcome is the small interface change.
2. **A hardware-independent alternative**, only if the owner wants a light that always works: a
   screen-brighten "work light" overlay (pure software). This is a **new feature** — it would need a
   §2.4 v1-scope check and a `DECISIONS.md` entry before any code.

**Why these carry no D-number:** the numbering collision from the parallel `main`/cloud sessions was
reconciled in `ef4ccfc`, and another session is actively editing the decision log for slice 1.10 as this
file lands. Minting a decision number from here would re-create the exact collision that was just fixed.
The next session to touch `DECISIONS.md` should number item 1 (the toggle-honesty fix) and decide item 2.

---

## 4. Sub-agent status (recorded because the owner asked)

No lane was ever assigned to torch or photo capture — capture was slice 1.4 (shipped, session 10,
`de35ad2`). The only background lane this session dispatched was the independent review of the
session-14 export batch; it **completed** and delivered its findings (an angle-label `strokeWidthMu`
defect, a stale test comment, and an `assetProvider` wiring note). Its job-board "running" state is
stale bookkeeping, not live work.
