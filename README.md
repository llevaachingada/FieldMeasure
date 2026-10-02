# Field Measure

A Surface app for the shop. Take a photo of a job, draw feet-and-inch dimensions on it with your
finger, and export a marked-up PDF or PNG for the job folder. It works offline, saves
everything to a folder on the Surface, and has no accounts, server or monthly cost.

Built by Hunter Singleton. It's yours to use, copy and change.

**Live app:** https://llevaachingada.github.io/FieldMeasure/

---

## 1. Put it on a Surface (2 minutes, needs Wi-Fi once)

1. Open the live app link above in **Microsoft Edge**.
2. Tap the **Install** icon at the right end of the address bar, then **Install**. (No icon? **…**
   menu → **More tools** → **Apps** → **Install Field Measure**.)
3. It opens in its own window. From now on, open it from the Start menu.
4. First time only: pick the hand you write with, then tap **Use Documents\FieldMeasure**. When
   asked about folder access, choose **Allow on every visit**.

After that it works with no signal. Tap **Help** at the top of any screen for the how-to. Projects
are normal folders in `Documents\FieldMeasure`; drag them into Dropbox to share.

A one-page version to print for the shop: [`docs/INSTALL.md`](docs/INSTALL.md).

## 2. Where it's at

| | |
|---|---|
| **Works** | New project → camera → room name → dimensions (calculator keypad, snapping, magnifier) → 14 markup tools (shapes, arrows, angles, freehand drawing, highlighter, text boxes, eraser, photo-in-photo) → one-page PDF/PNG with a date stamp and the VANGARDE watermark. Autosave, undo, offline. Touch only. |
| **Tested** | About 1,690 automated tests run on every change. A few timing-sensitive tests sometimes fail when the machine is busy and pass on a re-run. |
| **Not yet** | A real crew member using it on a real job. Do this first: [`docs/FIELD-TEST.md`](docs/FIELD-TEST.md) (17 checks; most take about an hour). |
| **Unfinished** | On-screen nudge arrows (keyboard arrows work), a version-history panel, and some wording marked "proposed". None of it blocks use. Full list: [`docs/STATUS.md`](docs/STATUS.md). |

## 3. Make your own copy (15 minutes, clicks only)

The live link above runs from my GitHub account. To own the app outright:

1. Sign in to GitHub (a shop account is best). Open
   https://github.com/llevaachingada/FieldMeasure → **Use this template** → **Create a new
   repository** → name it `FieldMeasure`, **Public** → **Create**.
   (No "Use this template" button? Use **+** → **Import repository** with
   `https://github.com/llevaachingada/FieldMeasure.git` instead.)
2. In your new repo: **Settings** → **Pages** → **Source: GitHub Actions**.
3. **Actions** tab → **Deploy to GitHub Pages** → the **Run workflow** dropdown on the right →
   the green **Run workflow** button. Wait for the green check (about 3 minutes).
4. **Settings** → **Pages** now shows your link: `https://<your-github-name>.github.io/FieldMeasure/`.

Install from your link on each Surface (section 1). Anyone who installed from my link: install
yours, pick **the same folder** on first run (every project is still there), then uninstall the
old one from the Start menu.

From then on, anything merged into your `main` branch updates the app by itself once the
automatic checks pass. Surfaces show **"Update ready"**, and tapping **Reload** applies it.

## 4. Change it with AI

The whole app was built with AI coding agents, and the repo is set up for the next one.
`AGENTS.md` holds the rules; `docs/STATUS.md`, `docs/CHANGELOG.md` and `docs/DECISIONS.md` are
the project's memory. Use **Claude Code** (claude.ai/code works in a browser with nothing to
install; connect it to your repo), or Cursor, Codex or Copilot.

**Start every session with:**

```text
Read AGENTS.md, docs/STATUS.md and docs/CHANGELOG.md. Tell me in plain English where the app
stands and what's unfinished. Don't change anything yet.
```

**To change something:**

```text
I want: <the change, in plain words>. Follow AGENTS.md: work on a new branch, run the checks
(tsc, vitest, build, playwright) and show me the results, never delete or loosen a test to make
it pass, update docs/DECISIONS.md, docs/CHANGELOG.md and docs/STATUS.md, then open a pull
request that explains in plain English what changed and what to try on a Surface.
```

**To fix a problem:**

```text
Problem: <what the person did, what they expected, what happened instead>. <Attach a screenshot.>
Follow AGENTS.md. First reproduce it and tell me the cause in plain English. Then fix it with a
test that fails before the fix and passes after, and open a pull request.
```

Then read the pull request and merge it. Once the automatic checks pass, it's live in about 5
minutes. Try it on one Surface. If it's wrong, open the merged pull request on GitHub and click
**Revert**.

**The rules:**
- Changes go through pull requests. **Merging to `main` is shipping.**
- Never let the AI delete, skip or loosen a test. A failing test here has been right every time.
- Be extra careful with `src/domain/` (measurement maths), `src/export/` (the PDF) and
  `src/fs/projectStore.ts` (saving). Bugs there mean wrong numbers or lost work.
- No servers, logins, cloud services or tracking. That's why it's free and private.
- Don't use `npm run dev` to look at the app. It shows a broken, unstyled page on purpose.

## 5. Run it on a PC (optional, for testing changes)

Needs [Node.js 24 LTS](https://nodejs.org/) and [Git](https://git-scm.com/download/win). In
**Command Prompt**:

```bat
git clone https://github.com/<your-github-name>/FieldMeasure.git
cd FieldMeasure
npm ci
npm run build
npm run preview
```

Open http://localhost:4173. Or run `powershell -ExecutionPolicy Bypass -File
tools\launch-fieldmeasure.ps1 -InstallShortcut`, which does the same and adds a desktop
shortcut. Don't do real work on a `localhost` copy; it can't move to the real link later.

## 6. If something goes wrong

| Problem | Fix |
|---|---|
| No Install option | Use Edge and the exact `https://` link. Check the Start menu; it may already be installed. |
| "This browser can't save to folders" | Use Edge (or Chrome). |
| Won't open offline | Open it once with Wi-Fi, wait 30 seconds, close it, then try again. |
| Home says **Folder permission expired** | Tap **Re-authorize** and choose **Allow on every visit**. |
| First-run questions again, no projects | It was opened from a different link. Pick the same folder; everything comes back. |
| Deploy fails at "configure-pages" | Settings → Pages → Source: **GitHub Actions**, then run it again. |
| The **CI** check is red, and the app didn't update | The app only deploys after the tests (CI) pass, so broken code never reaches the crews. Open the run and click **Re-run jobs** once. If it's still red, ask the AI why, and don't let it disable a test. |
| `npm` "is not recognized" or "scripts are disabled" | Install Node 24, then use Command Prompt (or type `npm.cmd`). |
| A measurement or export looks wrong | Treat it as serious. Keep the project folder, screenshot it, and use the "To fix a problem" prompt with the exact numbers typed. |

---

## For the AI and developers

- **Rules:** [`AGENTS.md`](AGENTS.md) (`CLAUDE.md` points to it).
- **Live docs:** [`docs/STATUS.md`](docs/STATUS.md) (state) · [`docs/CHANGELOG.md`](docs/CHANGELOG.md) ·
  [`docs/DECISIONS.md`](docs/DECISIONS.md) (why things are the way they are) ·
  [`docs/UNITS.md`](docs/UNITS.md) (feet-inch input and rounding rules) ·
  [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md) (mirrors in-app Help) · [`docs/INSTALL.md`](docs/INSTALL.md) ·
  [`docs/FIELD-TEST.md`](docs/FIELD-TEST.md) · `docs/appendix-strings*.md` (the on-screen wording contract).
- **Build history:** [`docs/archive/`](docs/archive/README.md) holds the original specs, plans, session
  handoffs and reviews. It's frozen; read it for background only.
- **Stack:** React 19, TypeScript, Konva (imperative, never react-konva), zustand + immer, zod,
  idb-keyval, @cantoo/pdf-lib, perfect-freehand, fflate, lucide-react, Vite, vite-plugin-pwa,
  Vitest + Playwright. The runtime dependency list is closed.
- **Checks (Node 24; first time: `npx playwright install chromium`):** `npx tsc --noEmit` ·
  `npx vitest run` · `npm run build` · `npx playwright test` · `node tools/third-party-notices.mjs --check`
  (CI fails if a dependency changed and the notices weren't regenerated) · `npm run clickthru`
  (screenshots the built app at Surface size; inspection, not a gate).
- **Deploy:** `.github/workflows/pages.yml` publishes `main` after CI passes on it, or when you click
  **Run workflow**. The base path comes from
  GitHub (`FM_BASE`), so a renamed repo or custom domain works. On another static host: build with
  `FM_BASE=/` (or the sub-path), publish `dist/`, and serve it over HTTPS.

## License

No license file. The author gives this code to Vangarde Woodworks to copy, run, change and rebrand
freely. Third-party components keep their own licenses: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
