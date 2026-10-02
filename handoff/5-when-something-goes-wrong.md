# 5. When something goes wrong

Find the symptom, do the fix. If it isn't here, paste the symptom into your AI tool with:
*"Read AGENTS.md and handoff/5-when-something-goes-wrong.md, then help me with this: <symptom>"*.

## Publishing (GitHub)

| Symptom | Cause | Fix |
|---|---|---|
| "Deploy to GitHub Pages" fails at **configure-pages** or says Pages isn't enabled | Pages isn't switched on yet | Settings → Pages → Source: **GitHub Actions**, then re-run the workflow |
| Deploy fails with "branch is not allowed to deploy to github-pages" | You deployed from a branch other than `main` | Merge to `main`, or Settings → Environments → github-pages → allow the branch |
| The site address shows **404** | Not deployed yet, or a typo in the address | Wait for the green check, then use the exact link shown in Settings → Pages |
| The site loads but looks unstyled or blank | You're looking at `npm run dev`, or an old browser cache | Use the GitHub Pages address, or `npm run build` + `npm run preview` locally. Press Ctrl+F5 once. |
| **CI** is red but the app still updated | CI (the tests) and publishing are separate workflows | Open the failed CI run. If it's `sheetEditor.dimension`, `gridReorder` or `appNewProject` timing tests, re-run it once; these are known to be load-sensitive. If it fails again, it's real: ask your AI to investigate. Never disable a test. |
| You renamed the repository and the app broke | Shouldn't happen: the app reads its path from GitHub | Re-run **Deploy to GitHub Pages**. Installed Surfaces have to install from the new address (see "address changed" below). |

## On the Surface

| Symptom | Cause | Fix |
|---|---|---|
| No **Install** option | Not Edge or Chrome, not the `https://` address, or already installed | Use Edge and the exact address. Check the Start menu; it may already be there. |
| "This browser can't save to folders" | Firefox, Safari or another browser | Use Microsoft Edge |
| The app won't open offline | It was never fully opened online after installing | Open it once with Wi-Fi on, wait 30 seconds, close it, then try offline again |
| Home says **Folder permission expired** | Edge forgot the folder permission after a restart | Tap **Re-authorize**, then choose **Allow on every visit** if offered |
| The first-run questions came back and the project list is empty | The app was opened from a **different address** than before (each address has its own memory) | Pick the **same folder** as before. All projects come back; nothing was deleted. |
| The camera doesn't open | Camera permission was denied, or another app is using the camera | Close other camera apps. Edge → **…** → Settings → Cookies and site permissions → Camera → allow the app's address |
| "Update ready" keeps appearing | An update is waiting | Tap **Reload** when not in the middle of something. Work is autosaved first. |
| Someone deleted the app | Option 2 installs can be removed | Reinstall from the same address and pick the same folder. Nothing is lost. |
| A measurement or export looks wrong | **Treat this as serious.** | Keep the project folder, take a screenshot, and use the "Fix something the crew reported" prompt in [4. Changing it with AI](4-changing-it-with-ai.md). Include the exact numbers typed. |

## On your PC (only if you use Path B in step 2)

| Symptom | Fix |
|---|---|
| `npm` "is not recognized" | Install Node.js 24 LTS from nodejs.org, then open a **new** Command Prompt |
| "running scripts is disabled on this system" | Use Command Prompt instead of PowerShell, or type `npm.cmd` |
| `npm ci` complains about the Node version | Install Node.js **24** LTS |
| Tests fail with "Executable doesn't exist" (a browser) | Run `npx playwright install chromium` once |
| Port 4173 already in use | Close the other preview window, or run `tools\launch-fieldmeasure.ps1 -Stop` |

## The address changed (moving everyone)

Each address (`https://something/...`) is its own app as far as Edge is concerned. If you move the
app to a new address or a new host:

1. Keep the old address running for a few weeks if you can.
2. Everyone installs from the new address and picks **the same projects folder** on first run.
3. Uninstall the old app from the Start menu.

The project files never move. They are always in the folder on the Surface.
