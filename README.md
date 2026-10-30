# Field Measure

Take a photo of a job, draw feet-and-inch dimensions on it with a finger or pen, and export a
marked-up PDF or PNG for the job folder. Built for Surface tablets, works on any Windows PC.

- Works offline. No accounts, no server, no monthly cost.
- Everything saves to a normal folder (`Documents\FieldMeasure`). Drag it into Dropbox to share.

Built by Hunter Singleton and given to Vangarde Woodworks. It's yours to use, copy and change.

**Live app:** https://llevaachingada.github.io/FieldMeasure/

**How to use it:** [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md), or tap **Help** inside the app.

---

## 1. Install it

There are two ways. Pick one per machine. Both save to the same projects folder, so you can switch
later without losing anything.

| | **A. Desktop shortcut (recommended for PCs)** | **B. Web app (quickest on a Surface)** |
|---|---|---|
| Time | About 10 minutes, once | About 2 minutes |
| Needs | Internet during install | Internet once |
| Runs from | This PC | The live link above |
| Updates | Re-run the installer | Automatic |

### A. Desktop shortcut

1. Open https://github.com/llevaachingada/FieldMeasure
2. Click the green **Code** button, then **Download ZIP**.
3. Open your **Downloads** folder. Right-click `FieldMeasure-main.zip` and pick **Extract All**,
   then **Extract**.
4. Open the extracted `FieldMeasure-main` folder and double-click **`Install Field Measure`**
   (the file named `Install Field Measure.cmd`).
5. If Windows shows **"Windows protected your PC"**: click **More info**, then **Run anyway**.
   This happens because the file came from the internet. It is safe.
6. A black window opens and does the rest:
   - installs **Node.js** if the PC doesn't have it (click **Yes** if Windows asks),
   - copies the app to `%LOCALAPPDATA%\FieldMeasure\app`,
   - builds it, puts a **Field Measure** shortcut on the desktop, and opens the app.
7. When it says **Done**, press any key. You can delete the ZIP and the extracted folder.

From now on, **double-click Field Measure on the desktop**. Each time, it closes any old copy
that is still running, then opens a fresh one. Leave the black window that flashes up alone; it
closes by itself.

**First time only:** pick the hand you write with, then tap **Use Documents\FieldMeasure**. When
asked about folder access, choose **Allow on every visit**.

**To update:** download the ZIP again and run the installer again. Your projects are not touched.

**To uninstall:** delete the desktop shortcut and the folder `%LOCALAPPDATA%\FieldMeasure` (paste
that into the File Explorer address bar). Your projects in `Documents\FieldMeasure` stay.

### B. Web app

1. Open the live app link above in **Microsoft Edge**.
2. Tap the **Install** icon at the right end of the address bar, then **Install**. (No icon? **…**
   menu → **More tools** → **Apps** → **Install Field Measure**.) Tick **Create desktop shortcut**
   if Edge offers it.
3. It opens in its own window. From now on, open it from the Start menu or the desktop.
4. First time only: same as above (hand, folder, **Allow on every visit**).
5. To check it works offline: turn on airplane mode, close and reopen it. It should still open.

## 2. If something goes wrong

| Problem | Fix |
|---|---|
| Installer: "Windows protected your PC" | **More info** → **Run anyway**. |
| Installer: "Could not install Node.js automatically" | It opens the Node.js page. Download the **LTS** Windows installer, click through with the defaults, then run the installer again. |
| Installer: "Installing parts failed" | Check the internet connection and run it again. |
| Shortcut opens a window that says "build failed" or "did not bind port" | Restart the PC and try once more. If it still fails, run the installer again. |
| No Install option in Edge | Use the exact `https://` link. Check the Start menu; it may already be installed. |
| "This browser can't save to folders" | Use Edge or Chrome. |
| Home says **Folder permission expired** | Tap **Re-authorize** and choose **Allow on every visit**. |
| First-run questions again and no projects | It was opened a different way (shortcut vs web app, or a new link). Pick the **same folder**; everything comes back. |
| A measurement or export looks wrong | Treat it as serious. Keep the project folder, take a screenshot, and pass both on with the exact numbers typed. |

More (camera, read-only projects, export): [`docs/USER-GUIDE.md`](docs/USER-GUIDE.md) section 6.

## 3. Where it's at

| | |
|---|---|
| **Works** | New project → camera → dimensions (calculator keypad, snapping, magnifier) → 14 markup tools (shapes, arrows, angles, pen, highlighter, text boxes, eraser, photo-in-photo) → one-page PDF/PNG with a date stamp and the VANGARDE watermark. Autosave, undo, offline. |
| **Tested** | About 1,690 automated tests run on every change. |
| **Unfinished** | On-screen nudge arrows (keyboard arrows work), a version-history panel, some wording marked "proposed". None of it blocks use. Full list: [`docs/CONTINUITY.md`](docs/CONTINUITY.md). |

## 4. Make your own copy (15 minutes, clicks only)

The live link runs from Hunter's GitHub account. To own the app outright:

1. Sign in to GitHub (a shop account is best). Open
   https://github.com/llevaachingada/FieldMeasure → **Use this template** → **Create a new
   repository** → name it `FieldMeasure`, **Public** → **Create**.
   (No "Use this template" button? Use **+** → **Import repository** with
   `https://github.com/llevaachingada/FieldMeasure.git`.)
2. In your new repo: **Settings** → **Pages** → **Source: GitHub Actions**.
3. **Actions** tab → **Deploy to GitHub Pages** → **Run workflow**. Wait for the green check
   (about 3 minutes).
4. **Settings** → **Pages** now shows your link: `https://<your-github-name>.github.io/FieldMeasure/`.

Use your repo's page for the ZIP download (install A) and your link for the web app (install B).
Anyone on the old web app: install from your link, pick **the same folder** on first run, then
uninstall the old one from the Start menu.

From then on, anything merged into your `main` branch updates the web app by itself. Surfaces show
**"Update ready"**; tapping **Reload** applies it.

## 5. Change it with AI

The whole app was built with AI coding agents, and the repo is set up for the next one. `AGENTS.md`
holds the rules, and `docs/` is the project's memory. Use **Claude Code** (claude.ai/code works in
a browser with nothing to install; connect it to your repo), or Cursor, Codex or Copilot.

**Start every session with:**

```text
Read AGENTS.md, docs/CONTINUITY.md and the last entry of docs/BUILD-LOG.md. Tell me in plain
English where the app stands and what's unfinished. Don't change anything yet.
```

**To change something:**

```text
I want: <the change, in plain words>. Follow AGENTS.md: work on a new branch, run the checks
(tsc, vitest, build, playwright) and show me the results, never delete or loosen a test to make
it pass, update docs/DECISIONS.md, docs/BUILD-LOG.md and docs/CONTINUITY.md, then open a pull
request that explains in plain English what changed and what to try on a Surface.
```

Read the pull request and merge it. The web app updates in about 3 minutes. Try it on one
machine. If it's wrong, open the merged pull request on GitHub and click **Revert**.

**The rules:**
- Changes go through pull requests. **Merging to `main` is shipping.**
- Never let the AI delete, skip or loosen a test. A failing test here has been right every time.
- Be extra careful with `src/domain/` (measurement maths), `src/export/` (the PDF) and
  `src/fs/projectStore.ts` (saving). Bugs there mean wrong numbers or lost work.
- No servers, logins, cloud services or tracking. That's why it's free and private.
- Don't use `npm run dev` to look at the app. It shows a broken, unstyled page on purpose. Use the
  desktop shortcut, or `npm run build` then `npm run preview`.

---

## For the AI and developers

- **Rules:** [`AGENTS.md`](AGENTS.md) (canonical; `CLAUDE.md` points to it).
- **State:** [`docs/CONTINUITY.md`](docs/CONTINUITY.md) and the last entry of
  [`docs/BUILD-LOG.md`](docs/BUILD-LOG.md). **Why:** [`docs/DECISIONS.md`](docs/DECISIONS.md).
- **Specs:** [`docs/preflight-handoff-v0.3-hardened.md`](docs/preflight-handoff-v0.3-hardened.md)
  (§2.4 is the v1 scope and wins every conflict) and
  [`docs/ui-spec-field-measure-v2-hardened.md`](docs/ui-spec-field-measure-v2-hardened.md).
- **Every file:** [`docs/INDEX.md`](docs/INDEX.md). The old plans, research and session handoffs
  were removed at handoff (D167) and are in git history at commit `8da91d2`.
- **Stack:** React 19, TypeScript, Konva (imperative, never react-konva), zustand + immer, zod,
  idb-keyval, @cantoo/pdf-lib, perfect-freehand, fflate, lucide-react, Vite, vite-plugin-pwa,
  Vitest + Playwright. Node 24+. The runtime dependency list is closed.
- **Checks:** `npx tsc --noEmit` · `npx vitest run` · `npm run build` · `npx playwright test` ·
  `npm run clickthru` (screenshots the built app at the Surface screen size; an inspection tool,
  not a gate).
- **Local run:** `npm ci`, `npm run build`, `npm run preview`, then http://localhost:4173.
  `tools/launch-fieldmeasure.ps1` does the same on Windows (`-Stop`, `-SkipBuild`,
  `-InstallShortcut`); `Install Field Measure.cmd` wraps it for non-developers.
- **Deploy:** `.github/workflows/pages.yml` builds and publishes every push to `main`. The base path
  comes from GitHub (`FM_BASE`), so a renamed repo or custom domain works. Other static hosts:
  build with `FM_BASE=/` (or the sub-path), publish `dist/`, and serve over HTTPS.

## License

No license file. The author gives this code to Vangarde Woodworks to copy, run, change and rebrand
freely. Third-party components keep their own licenses: [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
