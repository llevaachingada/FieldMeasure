# 4. Changing it with AI

The app was built almost entirely by AI coding agents, and the repository is set up so the next one
can carry on. You don't need to read code. You do need to follow one loop and a few rules.

## Which tool

| Tool | Install anything? | Notes |
|---|---|---|
| **Claude Code on the web** (claude.ai/code), or the Claude desktop app's Code tab | No, for the web version | **Recommended.** Connect your GitHub, pick your FieldMeasure repo, and type. It runs the full test suite in the cloud and opens a pull request for you. It reads `CLAUDE.md`, which points to `AGENTS.md`. |
| Cursor, OpenAI Codex, GitHub Copilot coding agent | Depends on the tool | All read `AGENTS.md` automatically. |
| Any chat AI with no repo access | | Fine for questions. Not for changes: it can't run the tests. |

## The loop (every change, every time)

```
  1. ASK            paste the "make a change" prompt below, with your change in it
        │
  2. AI WORKS       on a new branch: writes the change, runs the checks, updates docs/
        │
  3. PULL REQUEST   the AI opens one. You read its plain-English summary.
        │           Wait for the green check from "CI" on the pull request.
        │
  4. MERGE          click "Merge pull request" on GitHub
        │           → the app republishes itself in about 3 minutes
        │
  5. TRY IT         on ONE Surface: open the app, tap Reload on the update banner, use it
        │
  6. TELL THE CREW  or, if it's wrong: open the pull request → "Revert" → merge the revert
```

**Merging is shipping.** Whatever reaches `main` reaches the crew. That's why steps 3 and 5 matter.

## Copy-paste prompts

Replace the parts in `<angle brackets>`.

### Get oriented (start every new AI session with this)

```text
Read AGENTS.md, docs/CONTINUITY.md and the last entry of docs/BUILD-LOG.md before anything else.
Then tell me in plain English, in under 15 lines: the current state of the app, what is unfinished,
and anything that looks broken. Do not change any files yet.
```

### Make a change

```text
I want this change to Field Measure: <describe it the way you would to a person, e.g. "make the
dimension text bigger on exports" or "add a 1/16 inch button to the keypad">.

Follow AGENTS.md. Specifically:
- Work on a new branch, not main. Keep the change as small as possible.
- Put any new on-screen wording in src/ui/strings.ts.
- Run the checks: npx tsc --noEmit, npx vitest run, npm run build, npx playwright test.
  Show me the results. Never delete, skip or loosen a test to make it pass. If a test fails, tell
  me why in plain English and fix the code, not the test.
- If it changes what the user sees, run npm run clickthru and show me the screenshots.
- Add an entry to docs/DECISIONS.md and docs/BUILD-LOG.md, and update docs/CONTINUITY.md.
- Open a pull request. In the description, explain in plain English what changed, what I should
  try on a Surface, and anything you could not test.
```

### Fix something the crew reported

```text
A crew member reported this problem: <what they did, what they expected, what happened>.
<Attach a screenshot if you have one.>
First reproduce it and tell me the cause in plain English. Then fix it with a test that fails
before the fix and passes after. Follow the same rules as AGENTS.md: branch, checks, docs, pull
request.
```

### Undo a bad update fast

```text
The last update to main broke <what broke>. Revert the merge that caused it on a new branch and
open a pull request for the revert. Do not try to fix it forward yet. Then tell me the cause.
```

Or with no AI: on GitHub, open the merged pull request → **Revert** → **Merge**. It's live again in
about 3 minutes.

### Rebrand it (logo, watermark, name)

```text
Rebrand Field Measure for <company name>. The new logo files are attached / in <path>.
Replace the files in public/branding/ (keep the same file names and similar proportions), update
the app icon in public/icons/, and change any visible company name. Follow AGENTS.md, run the
checks, and show me before/after screenshots of the editor and an exported PDF.
```

### Do the next unfinished item

```text
Read docs/CONTINUITY.md and pick the most valuable unfinished item that does not need a real
Surface to verify. Explain it to me and how you would build it, and wait for my OK before
writing code.
```

### Monthly health check (optional)

```text
Run all the checks on main (tsc, vitest, build, playwright) and tell me if anything is failing
or flaky. List any dependencies with known security problems (npm audit), but do NOT upgrade
anything. Upgrades are a separate, deliberate change.
```

## Rules the AI must follow (it will find them in AGENTS.md; you are the backstop)

1. **No changes straight on `main`.** Branch → pull request → merge.
2. **Tests are never deleted, skipped or loosened** to get a green result. If an AI does it,
   reject the pull request. This rule exists because a failing test was right every time.
3. **Measurements are sacred.** Changes to `src/domain/units.ts`, `src/domain/snapping.ts`,
   `src/export/` or `src/fs/projectStore.ts` need extra scrutiny. Ask the AI to explain them
   twice.
4. **No new building blocks without a reason.** The list of libraries the app uses is closed on
   purpose. An AI that wants to `npm install` something new should explain why first.
5. **Never:** servers, logins, cloud services, analytics, tracking or Bluetooth.
6. **`npm run dev` is not how to look at the app.** Use `npm run build` then `npm run preview`,
   or `npm run clickthru` for screenshots.

## Where things are documented

| You want to know | Read |
|---|---|
| The rules | `AGENTS.md` |
| Where the project stands | `docs/CONTINUITY.md` |
| What the last session did | the last entry of `docs/BUILD-LOG.md` |
| Why something is the way it is | `docs/DECISIONS.md` (search for the feature name) |
| What still needs a real Surface | `docs/HARDWARE-TEST-CHECKLIST.md` |
| How the crew uses it | `docs/USER-GUIDE.md` |
| Every file and what it's for | `docs/INDEX.md` |

The docs are long because they're the AI's memory, not because you're meant to read them. Ask
your AI to read them and summarize.
