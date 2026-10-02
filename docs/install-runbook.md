# Install runbook — putting Field Measure on a Surface

> **New owners:** [`handoff/3-put-it-on-the-surfaces.md`](../handoff/3-put-it-on-the-surfaces.md) is the
> current version of this page, including the IT push (zero-touch) option.

This is a one-page guide for a crew member, not a developer. It takes about two minutes. You need
the network **once** (while you install); after that the app works offline.

The app lives at a fixed web address. Your crew lead will tell you the exact one. It looks like
this, with the real owner name in place of `<owner>`:

```
https://<owner>.github.io/FieldMeasure/
```

> **For developers testing locally:** the app runs at `http://localhost:4173` after `npm run build`
> and `npm run preview` (a secure context, so Install and offline mode work; D164 made the manifest
> scope follow the base so it installs there). `npm run dev` renders unstyled because of the CSP
> (D105) and cannot be used to look at the app.
> **Anything you create against a local address is disposable and is never migrated to production.**
> Use the real address for real work.

---

## 1. Open the app in Edge

1. On the Surface, open **Microsoft Edge**.
2. Type the app address (`https://<owner>.github.io/FieldMeasure/`) into the address bar and press
   Enter.
3. The Field Measure home screen appears.

## 2. Install it

1. Tap the **Install** icon at the right end of the address bar, then **Install**. (No icon? Open
   the **…** menu → **More tools** → **Apps** → **Install Field Measure**.)
2. When asked, confirm **Install**.
3. Field Measure opens **in its own window** — no address bar, no browser tabs. That is how you
   know the install worked. From now on, open it from the **Start menu** (search "Field Measure"),
   not from a browser tab.

## 3. Check it works offline

Offline operation is the whole point — a job site often has no signal.

1. Turn on **airplane mode** (Windows **Action Center** → **Airplane mode**).
2. Close and reopen the app from the Start menu (or press reload).
3. The app still opens. If it does not, the install did not finish — repeat step 2.

Turn airplane mode back off when you are done testing.

## 4. Answer the handedness question

1. On first run, the app asks **Which hand do you write with?**
2. Pick **Right** or **Left**. (Right is selected by default.)
3. This moves the tool rail to the side your hand does not cover. You can change it later in
   **Settings**.

## 5. Pick your projects folder

1. Next, the app asks **Where should your projects live?**
2. Choose **Use Documents\FieldMeasure** for the simple option, or **Choose folder** to pick your
   own location.
3. Windows asks for permission to read the folder. Allow it.
4. This is where every photo, sheet and export is saved — on this device, in this folder. Keep it
   on the Surface's own drive if you can.

---

## If something goes wrong

- **The app will not install:** make sure you typed the address exactly, including the trailing
  `FieldMeasure/`, and that you opened it in **Edge** (not another browser).
- **It will not open offline:** reinstall it (step 2) while you have network.
- **The first-run questions appear again and Home is empty:** the app was opened from a different
  web address than before (each address keeps its own memory; the «moved» screen in
  `src/data/originGuard.ts` is still a stub). Your project **files are safe on disk**. Pick the same
  folder again.
- **You see the first-run questions again after an update:** the app only keeps your folder and
  settings for the address you installed it from. If the address ever changes, re-pick your folder —
  nothing is lost from disk.
