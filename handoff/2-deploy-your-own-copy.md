# 2. Deploy your own copy (about 15 minutes, clicks only)

At the end of this page you will have your own repository and your own web address for the app.
Nobody else (including the person who gave it to you) can change it or take it down.

You do **not** need to install anything on your computer for this.

---

## Path A (recommended): your own copy on GitHub Pages

### Step 1. Make the copy (2 min)

1. Sign in to GitHub with the account the app should belong to. A company account or GitHub
   organization is better than someone's personal account, so it survives staff changes.
2. Open **https://github.com/llevaachingada/FieldMeasure**.
3. Click the green **Use this template** button, then **Create a new repository**.
   - **Owner:** your company account.
   - **Repository name:** `FieldMeasure`. You can use another name; the app adapts to it.
   - **Public.** On a free GitHub plan the app can only be published from a public repository.
   - Leave **Include all branches** unchecked.
4. Click **Create repository**.

> No "Use this template" button? Click **+** (top right) → **Import repository**, paste
> `https://github.com/llevaachingada/FieldMeasure.git`, give it the same settings and click
> **Begin import**. This keeps the full history and takes a few minutes longer.

### Step 2. Switch on the web address (1 min)

1. In **your new repository**, click **Settings** (top bar) → **Pages** (left side).
2. Under **Build and deployment** → **Source**, choose **GitHub Actions**.

That's the only setting. Nothing else needs to be changed.

### Step 3. Build and publish (about 3 min of waiting)

1. Click the **Actions** tab. If GitHub asks you to enable workflows, click the green button.
2. On the left, click **Deploy to GitHub Pages** → **Run workflow** (right side) → **Run workflow**.
3. Wait for the green check mark. It takes about 2 to 4 minutes.

> A red X from **before** step 2 is normal. That run started before Pages was switched on. Only
> the run you just started matters.
>
> The other workflow, **CI**, runs the roughly 1,690 automated tests. It is separate from
> publishing, and a red CI never takes the app down. See
> [5. When something goes wrong](5-when-something-goes-wrong.md) if it stays red.

### Step 4. Open it (1 min)

1. Go back to **Settings** → **Pages**. At the top it says **Your site is live at**
   `https://<your-github-name>.github.io/FieldMeasure/`.
2. Open that link in **Microsoft Edge**. You should see the Field Measure home screen.
3. **Write this link down.** It is the app's permanent address. Your IT team and crew need it in
   the next step.

### From now on

Every change that lands on your `main` branch republishes the app by itself in about 3 minutes.
Installed Surfaces show **"Update ready — reload when you're done"** and update when the person taps
**Reload**. You never have to deploy by hand again.

**Done. Next: [3. Put it on the Surfaces](3-put-it-on-the-surfaces.md)**

---

## Path B: try it on one Windows PC first (optional)

Use this to poke at the app or test a change on your own machine before it goes to anyone else. **Do
not do real work on this copy.** Projects created at a `localhost` address cannot move to the real
address later. (The files on disk are fine; the app just will not remember the folder.)

You need [Node.js 24 LTS](https://nodejs.org/) and [Git for Windows](https://git-scm.com/download/win).
Then, in **Command Prompt** (not PowerShell; see the note below):

```bat
git clone https://github.com/<your-github-name>/FieldMeasure.git
cd FieldMeasure
npm ci
npm run build
npm run preview
```

Open **http://localhost:4173** in Edge. Press Ctrl+C in the window to stop it.

Or, on Windows, run the built-in launcher, which does all of the above and can add a desktop
shortcut:

```bat
powershell -ExecutionPolicy Bypass -File tools\launch-fieldmeasure.ps1 -InstallShortcut
```

> **Never use `npm run dev`.** It shows an unstyled, broken page. That is expected: the app's
> security policy blocks the developer server's shortcuts. Always use build, then preview.
>
> **PowerShell says "running scripts is disabled"?** Use Command Prompt, or type `npm.cmd`
> instead of `npm`.

Or let your AI tool do it: *"Clone my FieldMeasure repo, install it with `npm ci`, build it and start
`npm run preview`, then give me the link. Do not use `npm run dev`."*

---

## Path C: host it somewhere other than GitHub (optional)

Any static web host works: Cloudflare Pages, Netlify, Azure Static Web Apps, or an internal IIS
server. Two requirements:

| Setting | Value |
|---|---|
| Build command | `npm ci && npm run build` (Node 24) |
| Output folder | `dist` |
| `FM_BASE` environment variable | The path the app lives under, with slashes at both ends: `/` at the root of a domain, `/FieldMeasure/` under a sub-folder |
| HTTPS | **Required.** Without it the app cannot install or work offline. |

Pick the address once and keep it. Each Surface remembers its projects folder **per address**. If the
address changes, every person has to pick their folder again (nothing is lost on disk, but it is
confusing).
