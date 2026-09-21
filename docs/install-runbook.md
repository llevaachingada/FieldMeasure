# Install runbook — putting Field Measure on a Surface

This is a one-page guide for a crew member, not a developer. It takes about two minutes. You need
the network **once** (while you install); after that the app works offline.

The app lives at a fixed web address. Your crew lead will tell you the exact one. It looks like
this, with the real owner name in place of `<owner>`:

```
https://<owner>.github.io/FieldMeasure/
```

> **For developers testing locally:** the app also runs at `http://localhost:5173` (Vite dev) or
> `http://localhost:4173` (preview). Both are secure contexts, so Install and offline mode work.
> **Anything you create against a local address is disposable and is never migrated to production.**
> Use the real address for real work.

---

## 1. Open the app in Edge

1. On the Surface, open **Microsoft Edge**.
2. Type the app address (`https://<owner>.github.io/FieldMeasure/`) into the address bar and press
   Enter.
3. The Field Measure home screen appears.

## 2. Install it

1. In Edge, open the **…** menu (top-right) → **Apps** → **Install this site as an app**.
   (Edge may also show a small **Install** icon in the address bar — either works.)
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

## 4. Pick your projects folder

1. On first run, the app asks **Where should your projects live?**
2. Choose **Use Documents\FieldMeasure** for the simple option, or **Choose folder** to pick your
   own location.
3. Windows asks for permission to read the folder. Allow it.
4. This is where every photo, sheet and export is saved — on this device, in this folder. Keep it
   on the Surface's own drive if you can.

## 5. Answer the handedness question

1. The app asks **Which hand do you write with?**
2. Pick **Right** or **Left**. (Right is selected by default.)
3. This moves the tool rail to the side your hand does not cover. You can change it later in
   **Settings**.

---

## If something goes wrong

- **The app will not install:** make sure you typed the address exactly, including the trailing
  `FieldMeasure/`, and that you opened it in **Edge** (not another browser).
- **It will not open offline:** reinstall it (step 2) while you have network.
- **The app shows "This app moved to a new address":** the app was moved to a different web
  address. Your project **files are safe on disk**. Tap **Pick my projects folder** and choose your
  folder again.
- **You see the first-run questions again after an update:** the app only keeps your folder and
  settings for the address you installed it from. If the address ever changes, re-pick your folder —
  nothing is lost from disk.
