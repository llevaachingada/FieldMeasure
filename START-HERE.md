# Start here: Field Measure is yours

Field Measure is a free app for Microsoft Surface tablets. You take a photo of a site, draw
feet-and-inch dimensions on it with a finger or pen, and export a marked-up PDF or PNG into a
folder you drag into Dropbox. It works offline. It has no server, no logins, no accounts and no
monthly bill.

This repository is a gift. You can copy it, run it, change it and rebrand it.

---

## How it works (one picture)

```
  YOUR GitHub repo ──push to main──▶ GitHub Actions builds it (about 3 min, free)
                                              │
                                              ▼
                     https://<your-github-name>.github.io/FieldMeasure/
                                              │
                         Edge on each Surface: "Install" (once, needs Wi-Fi)
                                              │
                                              ▼
              Field Measure app in the Start menu. Works offline from then on.
              Photos, sheets and exports are saved in a folder ON the Surface.
```

There is nothing to run, host, pay for or babysit. GitHub stores the code and serves the app.
Each Surface keeps its own files.

---

## Your path: about 45 minutes in total

| Step | What you do | Time | Guide |
|---|---|---|---|
| 1 | Read what you are getting: what works and what has not been tested on a real Surface yet | 5 min | [`handoff/1-what-you-are-getting.md`](handoff/1-what-you-are-getting.md) |
| 2 | Make your own copy and switch on its web address. Only clicks, no code | 15 min | [`handoff/2-deploy-your-own-copy.md`](handoff/2-deploy-your-own-copy.md) |
| 3 | Put it on the Surfaces: IT pushes it, or each person taps Install | 10 min | [`handoff/3-put-it-on-the-surfaces.md`](handoff/3-put-it-on-the-surfaces.md) |
| 4 | Learn the safe way to change it with an AI coding tool | 10 min | [`handoff/4-changing-it-with-ai.md`](handoff/4-changing-it-with-ai.md) |
| 5 | Keep this open for when something goes wrong | as needed | [`handoff/5-when-something-goes-wrong.md`](handoff/5-when-something-goes-wrong.md) |

Ready-to-send emails for your IT team and your crew: [`handoff/emails/`](handoff/emails/).

---

## The shortcut, if you use an AI coding tool

Open this repo (your copy) in Claude Code, Cursor, Codex or GitHub Copilot and paste:

```text
Read START-HERE.md, AGENTS.md, docs/CONTINUITY.md and the last entry of docs/BUILD-LOG.md.
Then explain to me in plain English: what this app does, how it gets deployed, what is not
finished, and the rules I must not break when I change it. Do not change any files.
```

The repo is built to be worked on by AI. `AGENTS.md` holds the rules and `docs/` is the project's
memory, so a new AI session picks up where the last one stopped. Keep that memory up to date (the
AI does it for you if you use the prompts in step 4) and the tool stays useful for years.

---

## Five rules that keep it working

1. **Change things through pull requests, never straight on `main`.** Every push to `main` goes to
   the crew within minutes.
2. **Never let the AI delete or weaken a test to make it pass.** A failing test has caught a real
   measurement bug here more than once.
3. **Never run `npm run dev` to look at the app.** It shows a broken, unstyled page on purpose
   (the security policy blocks it). Use `npm run build` and then `npm run preview`.
4. **Never add a server, login, cloud service or tracking.** It is offline and private on purpose.
5. **Try a change on one Surface before the crew relies on it.** If something goes wrong, open the
   pull request on GitHub and click "Revert". The fix is live again in about 3 minutes.
