# Archive: how Field Measure was built

Everything here was written **to build** the app (specs, plans, session handoffs, reviews and
process). None of it is needed to use, deploy or change the app. It's kept because it explains
*why* things are the way they are, and AI tools can search it when a question goes deep.

These files are frozen: don't update them. Live documents are one level up, in [`docs/`](../).
The decision log [`../DECISIONS.md`](../DECISIONS.md) is still live and links into this folder.

| Group | Files |
|---|---|
| **Specs** (what the app should be) | [`preflight-handoff-v0.3-hardened.md`](preflight-handoff-v0.3-hardened.md) (the build spec; §2.4 is the v1 scope), [`ui-spec-field-measure-v2-hardened.md`](ui-spec-field-measure-v2-hardened.md) (look and feel), [`touch-first-interaction-model.md`](touch-first-interaction-model.md) (gestures and timings). Superseded drafts: [`preflight-handoff.md`](preflight-handoff.md), [`ui-spec-field-measure.md`](ui-spec-field-measure.md) |
| **Plans** | [`implementation-plan.md`](implementation-plan.md) (the slice plan), [`beta-readiness-fix-plan.md`](beta-readiness-fix-plan.md), [`gui-ux-readiness-and-design-handoff.md`](gui-ux-readiness-and-design-handoff.md), [`handoff-ui-pass-for-claude.md`](handoff-ui-pass-for-claude.md), [`appendix-scaffold-files.md`](appendix-scaffold-files.md) |
| **Process** | [`BUILD-RUNBOOK.md`](BUILD-RUNBOOK.md) (how sessions worked), [`clickthru-harness.md`](clickthru-harness.md) (the `npm run clickthru` screenshot tool), [`CHECKPOINTS.md`](CHECKPOINTS.md), [`INDEX.md`](INDEX.md) (the old file map) |
| **History** | [`BUILD-LOG.md`](BUILD-LOG.md) (every session), [`CONTINUITY.md`](CONTINUITY.md) (the build-era status page) |
| **Session handoffs** | `handoff-session-11/12/13/14/21/23/28/29.md`, [`handoff-capture-save.md`](handoff-capture-save.md), [`handoff-plan-verification.md`](handoff-plan-verification.md), [`investigation-torch-and-capture.md`](investigation-torch-and-capture.md) |
| **Reviews** | [`review-session-4-hardening.md`](review-session-4-hardening.md), [`review-brief.md`](review-brief.md), [`review-handoff.md`](review-handoff.md) |
| **Hardware ledger** | [`HARDWARE-TEST-CHECKLIST.md`](HARDWARE-TEST-CHECKLIST.md) (the full engineering checklist; the short version is [`../FIELD-TEST.md`](../FIELD-TEST.md)) |

Some of these describe pen input. The shop uses touch only (D167), so treat pen-specific sections as
history.
