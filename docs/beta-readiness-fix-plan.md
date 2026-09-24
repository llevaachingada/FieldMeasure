# Beta Readiness Fix Plan (parallel lanes)

**Status:** plan, not started. **Written:** 2026-09-24 (session 27). **Next free decision number:** D137.

This plan fixes every finding from the session-27 Beta Launch Readiness Review, then pays down
the structural complexity that produced those findings. Lower-effort subagents ("lanes") can run it
without extra context. Each lane brief below is **self-contained**: a lane reads only
its own brief plus the files it names.

> **Authority.** This plan is subordinate to `AGENTS.md`, `docs/BUILD-RUNBOOK.md` (§11 is the
> parallel lane protocol this plan follows) and the build spec §2.4. Where this plan changes
> behaviour that an existing test pins, the orchestrator records the decision in
> `docs/DECISIONS.md` **before** any lane edits that test (AGENTS non-negotiable 7: fix the spec
> first, then the test).

---

## 0. How to use this document

| You are | Read | Do |
|---|---|---|
| **Orchestrator** (the main session) | All of it | Run §3 pre-flight, dispatch lanes per wave, run §5 / §7 / §9 integration |
| **Lane** (a subagent) | §1 (rules) + **only your lane's brief** | Edit only the files your brief says you own, verify, report using §1.6 |

Waves are sequential. Lanes inside a wave run **in parallel**. No lane starts until its wave's
pre-flight is done.

```
Wave 1  (beta blockers, 6 lanes in parallel)      L1  L2  L3  L4  L5  L6
          │ integration + full gate + clickthru + commit per lane
Wave 2  (safe refactors, 4 lanes in parallel)     R1  R2  R3  R4
          │ integration + full gate + clickthru + commit per lane
Wave 3  (cross-cutting refactor, serial)          R5  →  R6
          │ integration + full gate + clickthru + commit
Wave 4  (owner sign-off required)                 R7 (docs diet)
```

---

## 1. Rules every lane follows (copy this section into every lane prompt)

### 1.1 Project facts you must not violate
- Field Measure is a **local-only, offline PWA**. No servers, databases, sign-in, analytics,
  telemetry, cloud SDKs. `console.error` is fine. Sending anything off-device is not.
- **All disk writes go through `src/fs/projectStore.ts`** (`writeJsonAtomic` / `writeAtomic`).
  Never call `createWritable()` anywhere else.
- **Imperative Konva only.** Do not add `react-konva`.
- **The runtime dependency list is closed.** Do not add a package. `lucide-react` icons are
  already available.
- **Never delete or weaken a test** to make it pass. The only test assertions you may change are
  the ones your brief names explicitly, for the decision number it names.
- **All user-visible text lives in `src/ui/strings.ts`**, but that file is **contended** (see
  1.2). A lane that needs new copy **stages it** in its own new module
  `src/ui/<lane>Copy.ts` (the brief names the file and gives the exact strings). The orchestrator
  folds it into `strings.ts` at integration.
- Every numeric constant you introduce gets a one-line comment explaining where the number comes
  from.

### 1.2 Contended files: never edit unless your brief says you own it
```
src/ui/strings.ts        src/styles.css          src/App.tsx
src/state/appStore.ts    src/state/editorStore.ts
docs/**                  (orchestrator only, always)
```
Wave 1 exception: **L1 owns `src/App.tsx`**. Nobody else touches it in Wave 1.

### 1.3 Never import a sibling lane's in-flight file
If you need something another lane is building, your brief gives you a **pinned interface**: an
optional prop or an injectable function. The orchestrator wires the real thing at integration.

### 1.4 Verification (lanes run only this subset)
Linux / cloud container:
```bash
npx tsc --noEmit
npx vitest run --project node --project jsdom
```
Windows build machine (PowerShell): prefix `$env:Path = "C:\Program Files\nodejs;" + $env:Path;`
and use `npx.cmd`.

Lanes must **not** run `npm run build`, `npx playwright test`, `npm run clickthru`, or the
`browser` Vitest project. `dist/`, the ports and the browser are shared, so the orchestrator
runs those.

If `tsc` reports errors **only in files you do not own**, another lane is mid-edit. Say so in
your report and do not "fix" them.

### 1.5 Stop and report instead of guessing when
- a step's code doesn't fit the file (for example, a line number moved and the surrounding code is
  different from what the brief quotes). Search for the quoted text. If it isn't there, stop.
- an existing test fails and your brief does not name it.
- the same check fails three times with three genuinely different fixes (runbook §6).

### 1.6 Report format (your final message)
```
LANE: <id>
FILES CHANGED: <list, one per line, with + for new files>
TESTS ADDED: <file: test names>
TESTS CHANGED (named in brief only): <file:line → decision id>
GATES: tsc=<exit code>  vitest node+jsdom=<passed>/<total>
STAGED COPY: <file or "none">
SEAMS FOR ORCHESTRATOR: <what must be wired at integration, or "none">
SURPRISES: <anything that disagreed with this brief, and what you did>
```

---

## 2. Findings → work map

| Finding (review, session 27) | Severity | Evidence | Fixed by |
|---|---|---|---|
| F1: the last edit is lost when leaving the editor within ~400 ms | Critical | Reproduced: pen stroke, then «Projects» → `markup.json` has 0 objects after 16 s | **L1**, regression-locked by **L6** |
| F2: the grid shows «Couldn't read this project folder» after every editor visit | Critical | Reproduced with a screenshot. `clearOpenProject` on editor unmount deregisters the project the grid reloads | **L1**, **L5** (Retry), **L6** |
| F3: no error boundary, so any render crash or chunk-load failure is a blank page | High | `grep` finds zero boundaries. `main.tsx` renders `<App/>` bare | **L2** |
| F4a: first run dead-ends silently with no folder API | High | Reproduced: still on step 2, zero alerts | **L3** |
| F4b: «Use Documents\FieldMeasure» only opens the picker. Picking `Documents` floods Home with junk cards | High | Code: `projectsRoot.ts:55`, `scanOne` returns `unreadable` for any non-project folder | **L3** + **L4** |
| F4c: non-cancel picker errors are swallowed | Medium | `FirstRun.tsx:59` | **L3** |
| F5: Home and grid look unfinished (placeholder meta, blank thumbnails, disabled cards, «1 sheets», error with no way out) | Medium | Screenshots | **L4** (cover reader) + **L5** |
| C1: `SheetEditor.tsx` holds one ~1,256-line `useEffect` (lines 426-1682) | Structural | 25 state, 35 refs, 40 imports | **R1** then **R6** |
| C2: lifecycle lives in module singletons (`openProjects`, editor session, stores) | Structural | Root cause of F1 and F2 | **R5** |
| C3: `App.tsx` is an implicit state machine (18 `useState`) | Structural | Falls through to Home when `editorTarget` is null | **R2** |
| C4: `ProjectScreen.tsx` (1,688 lines, 27 refs) and `CameraFlow.tsx` (1,432 lines, 16 catches) | Structural | Metrics | **R3**, **R4** |
| C5: no test covers screen-to-screen transitions | Process | 1,302 green tests while F1 and F2 ship | **L6** |
| C6: ~1.9 MB of required reading before coding | Process | `DECISIONS.md` 294 KB, `CONTINUITY.md` 133 KB | **R7** (owner sign-off) |

---

## 3. Wave 1 pre-flight (orchestrator, before dispatch)

1. `git checkout claude/quirky-ramanujan-4xn374 && git pull` and confirm a clean tree.
2. Run the baseline and paste the numbers into the Wave 1 BUILD-LOG draft:
   ```bash
   npx tsc --noEmit
   npx vitest run --project node --project jsdom          # expect 1302/1302 at plan time
   ```
3. Write these **decision stubs** into `docs/DECISIONS.md` now (full text at integration). L4 and L5
   change pinned tests, and the decision has to exist first:
   - **D137** Save-on-exit: the editor awaits its autosave before leaving. The open-project registry is
     owned by the shell (`App`), not the editor. (L1)
   - **D138** Error boundaries at app and route level, one guarded auto-reload on a chunk-load
     failure, and a global `unhandledrejection` toast. (L2)
   - **D139** First run: «Use Documents\FieldMeasure» creates or uses a `FieldMeasure` child of the picked
     folder. There's a visible unsupported-browser notice and a visible picker-failure line. (L3)
   - **D140** The Home scan **hides** root subfolders that have neither `project.json` nor
     `.history/_project/`. A folder with a *corrupt* `project.json` is still shown as unreadable.
     This supersedes the `NotAProject` half of `tests/projectStore.test.ts:501`. (L4)
   - **D141** Home hides the unbuilt folder-adoption controls instead of showing them disabled.
     The card meta shows «{sheets} · {time}» with a real time and a pluralized sheet count, plus a
     cover thumbnail. This supersedes `tests/projectList.test.tsx:82-88` and `:173-187`. (L5)
   - **D142** The sheets grid's error state gets «Retry». The header count is pluralized and hidden
     while in the error state. (L5)
   - **D143** A headless **journey** e2e spec (`tests/e2e/journey.spec.ts`) becomes a machine gate
     for screen transitions. The clickthru stays "never a gate". This spec is separate from it.
     Both runners honour `PW_CHROMIUM_PATH`. (L6)
4. Dispatch L1 to L6 **in one message, in parallel**, each with §1 plus its brief. Recommended
   `subagent_type`: `general-purpose`. Give each lane a distinct `description` (`L1 save-on-exit`, and so on).

---

## 4. Wave 1 lane briefs

### L1: Save-on-exit and shell-owned project registration (fixes F1, F2)

**Owns (may write):** `src/ui/SheetEditor.tsx`, `src/ui/EditorLayout.tsx`, `src/App.tsx`,
`+src/ui/exitSaveCopy.ts`, `+tests/editorExitSave.test.tsx`, `+tests/appGridReturn.test.tsx`.
**Reads only:** `src/state/persistQueue.ts`, `src/fs/projectStore.ts`, `src/editor/session.ts`,
`tests/editorShell.test.tsx`, `tests/appNewProject.test.tsx`.

**Root cause (so you understand what you are fixing):**
1. `SheetEditor`'s effect cleanup calls `void persist.flush()` without awaiting it, then
   synchronously calls `leaseRef.current?.release()`, `channelRef.current?.close()` and
   `clearOpenProject(projectId)`.
2. The flush's write (`persistQueue.ts` `defaultWrite`) awaits before calling
   `resolveOpenProjectDir(projectId)`, which reads the registry. By then the registry entry is gone,
   so the write throws "project … is not open in this tab" and retries at 1 s, 3 s and 10 s, all failing.
3. `App`'s grid-load effect also calls `resolveOpenProjectDir`, so the grid hits the same missing
   entry and shows its error state.

**Steps:**

1. **`src/ui/SheetEditor.tsx`, the effect cleanup** (search for the exact text
   `// Land any coalesced markup write before the scene is torn down.`).
   Replace:
   ```ts
      // Land any coalesced markup write before the scene is torn down.
      void persist.flush();
   ```
   with:
   ```ts
      // D137: land any coalesced markup write BEFORE the lease and channel go. The flush's write
      // resolves the project directory after an await, so nothing it needs may be released
      // synchronously here. The lease and channel are captured now and released once it settles.
      const closingLease = leaseRef.current;
      const closingChannel = channelRef.current;
      leaseRef.current = null;
      channelRef.current = null;
      void persist.flush().finally(() => {
        closingChannel?.close();
        closingLease?.release();
      });
   ```
   Then **delete** these four lines further down in the same cleanup (search for them exactly):
   ```ts
      channelRef.current?.close();
      channelRef.current = null;
      leaseRef.current?.release();
      leaseRef.current = null;
   ```
   Then **delete** the line `clearOpenProject(projectId);` at the end of the cleanup (the shell owns
   registration now). Remove `clearOpenProject,` from the `@/fs/projectStore` import list **only if**
   `grep -n clearOpenProject src/ui/SheetEditor.tsx` shows no other use.
   Leave `registerOpenProject(projectId, folderName)` at the start of the load IIFE alone. It is
   idempotent and keeps a bare mount working.

2. **Create `src/ui/exitSaveCopy.ts`** (staged copy, the orchestrator folds it in):
   ```ts
   /** Staged copy for D137 (L1). Folded into `strings.ts` → `STRINGS.editor.exitSaveFailed` at integration. */
   export const EXIT_SAVE_COPY = {
     exitSaveFailed: "Couldn't save your last change. Tap Projects again to leave anyway.",
   } as const;
   ```

3. **`src/ui/EditorLayout.tsx`, the save-then-exit wrapper.**
   Add imports (merge into the existing import lines if the module is already imported):
   ```ts
   import { editorSession, emitToast } from '@/editor/session';
   import { EXIT_SAVE_COPY } from './exitSaveCopy';
   ```
   Inside the component, near the other `useCallback`/`useRef` declarations (before the `useEffect`
   that installs the `keydown` handler), add:
   ```ts
   /** D137: how long an exit waits for autosave before treating it as failed (the persist queue's
    *  longest single backoff step is 10 s; 8 s keeps a tap responsive while covering a normal
    *  coalesced write, which lands in well under 1 s). */
   const EXIT_SAVE_TIMEOUT_MS = 8000;
   const exitingRef = useRef(false);
   /** Set after one failed save-on-exit: the NEXT exit request leaves without waiting. */
   const forceExitRef = useRef(false);
   const exitAfterSave = useCallback(async (): Promise<void> => {
     if (exitingRef.current) return;
     if (forceExitRef.current) {
       forceExitRef.current = false;
       onExit();
       return;
     }
     exitingRef.current = true;
     try {
       const flush = editorSession()?.flush;
       if (flush) {
         await Promise.race([
           flush(),
           new Promise<never>((_, reject) =>
             setTimeout(() => reject(new Error('exit save timed out')), EXIT_SAVE_TIMEOUT_MS),
           ),
         ]);
       }
       onExit();
     } catch {
       forceExitRef.current = true;
       emitToast({ text: EXIT_SAVE_COPY.exitSaveFailed, urgent: true });
     } finally {
       exitingRef.current = false;
     }
   }, [onExit]);
   ```
   `EXIT_SAVE_TIMEOUT_MS` may go at module scope instead if the file keeps constants there. Match the
   file's style.
   Then replace **every** place this component passes or calls `onExit` for navigation:
   - In the Escape branch of the keydown handler: `else onExit();` → `else void exitAfterSave();`,
     and in that effect's dependency array replace `onExit` with `exitAfterSave`.
   - `<TopBar ... onExit={onExit}` → `onExit={() => void exitAfterSave()}`.
   - `<SheetEditor ... onExit={onExit}` → `onExit={() => void exitAfterSave()}`.
   Run `grep -n "onExit" src/ui/EditorLayout.tsx` afterwards. The only remaining raw uses should be the
   prop declaration, the destructuring, and the call inside `exitAfterSave`.

4. **`src/App.tsx`, shell-owned registration.**
   a. Add `clearOpenProject` to the existing `@/fs/projectStore` import.
   b. In the grid-load `useEffect` (search `§11.9: the 14-day prune runs on project open`), add as the
      **first statement after** `if (route !== 'project' || !editorTarget) return;`:
      ```ts
      // D137: the shell owns the open-project registry. Re-registering is idempotent and makes the
      // grid's reads independent of whatever an unmounting editor did.
      registerOpenProject(editorTarget.projectId, editorTarget.folderName);
      ```
   c. In the `ProjectScreen` `onBack` handler, change:
      ```ts
          onBack={() => {
            setSelectedSheetIds([]);
            setRoute('home');
          }}
      ```
      to:
      ```ts
          onBack={() => {
            setSelectedSheetIds([]);
            // D137: leaving the project is the one place its registration ends.
            clearOpenProject(editorTarget.projectId);
            setRoute('home');
          }}
      ```

5. **Tests: `tests/editorExitSave.test.tsx`** (jsdom). Copy the `vi.mock('@/ui/SheetEditor', …)` block
   and the render helper from `tests/editorShell.test.tsx` verbatim (lines ~27-100). Then add:
   - `it('waits for autosave before leaving')`: `setEditorSession({ ...stubSession, flush: () => deferred.promise })`.
     Click the «Projects» breadcrumb (`getByRole('button', { name: STRINGS.editor.breadcrumbProjects })`).
     Assert `onExit` **not** called, resolve the deferred, `await waitFor(() => expect(onExit).toHaveBeenCalledTimes(1))`.
   - `it('stays and warns when autosave fails, then leaves on the second request')`: flush rejects.
     After the first click, assert `onExit` not called and that a toast with
     `EXIT_SAVE_COPY.exitSaveFailed` was emitted (subscribe with `subscribeToastMessage` from
     `@/editor/session`). After the second click, assert `onExit` called once.
   - `it('a double tap does not exit twice')`: flush pending, click twice, resolve, assert one call.
   - `it('leaves immediately when there is no editor session')`: `setEditorSession(null)`, click,
     assert called.
   Build `stubSession` with every `EditorSession` method as `vi.fn()` (see `src/editor/session.ts`
   for the list). Reset with `setEditorSession(null)` and `resetToastBus()` in `afterEach`.

6. **Tests: `tests/appGridReturn.test.tsx`** (jsdom). Copy the `vi.mock` blocks for
   `@/settings/projectsRoot`, `@/ui/EditorLayout` and `@/ui/ProjectScreen` from
   `tests/appNewProject.test.tsx`. Mock `@/fs/projectStore` partially with
   `vi.mock('@/fs/projectStore', async (orig) => ({ ...(await orig()), registerOpenProject: vi.fn(), clearOpenProject: vi.fn(), resolveOpenProjectDir: vi.fn(), readProjectFile: vi.fn() }))`,
   and `@/fs/projectSheets` → `listProjectSheets: vi.fn(async () => [])`.
   Tests:
   - opening the grid calls `registerOpenProject` with the full `${id}:${folderName}` key **every time
     the grid loads** (trigger a second load by making the mocked `EditorLayout` call `onExit`).
   - `onBack` from the grid calls `clearOpenProject` with that key.
   If driving `App` into the project route through the mocked `ProjectList` is awkward, follow exactly
   how `appNewProject.test.tsx` reaches the project route, and say in SURPRISES what you did.

**Done when:** gates green, and `grep -n "clearOpenProject" src/ui/SheetEditor.tsx` returns nothing.
**Seams for the orchestrator:** fold `EXIT_SAVE_COPY` into `strings.ts`. The end-to-end proof is L6's
journey spec (it must go from red to green once L1 lands).

---

### L2: Error boundaries and global error handling (fixes F3)

**Owns:** `+src/ui/ErrorBoundary.tsx`, `+src/ui/errorBoundary.css`, `+src/ui/globalErrors.ts`,
`+src/ui/errorBoundaryCopy.ts`, `src/main.tsx`, `+tests/errorBoundary.test.tsx`,
`+tests/globalErrors.test.ts`.
**Does not touch:** `src/App.tsx` (the route-level wiring is an orchestrator seam), `src/styles.css`.

**Steps:**

1. `src/ui/errorBoundaryCopy.ts`:
   ```ts
   /** Staged copy for D138 (L2). Folded into `STRINGS.errorBoundary` at integration. */
   export const ERROR_BOUNDARY_COPY = {
     title: 'Something went wrong',
     body: 'Work that was already saved is still in your projects folder.',
     reload: 'Reload',
     backToProjects: 'Back to Projects',
     unexpected: 'Something went wrong. If it keeps happening, reload the app.',
   } as const;
   ```

2. `src/ui/ErrorBoundary.tsx`, a class component (React 19 still requires a class for boundaries):
   ```tsx
   import { Component, type ErrorInfo, type ReactNode } from 'react';
   import { ERROR_BOUNDARY_COPY as COPY } from './errorBoundaryCopy';
   import './errorBoundary.css';

   /** sessionStorage key + window for the one-shot chunk-reload guard (a reload loop must be impossible). */
   export const CHUNK_RELOAD_KEY = 'fm:chunk-reload-at';
   /** Two reloads inside this window mean the reload did not help, so show the fallback instead (60 s). */
   export const CHUNK_RELOAD_WINDOW_MS = 60_000;

   export function isChunkLoadError(error: unknown): boolean {
     const message = error instanceof Error ? error.message : String(error);
     const name = error instanceof Error ? error.name : '';
     return (
       name === 'ChunkLoadError' ||
       /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)
     );
   }

   export interface AppErrorBoundaryProps {
     children: ReactNode;
     /** 'app' = whole-app fallback (Reload only); 'route' = adds «Back to Projects». */
     variant: 'app' | 'route';
     /** Route variant: navigate somewhere safe and clear the error. */
     onReset?: () => void;
     /** Injectable for tests. Default: `window.location.reload()`. */
     reload?: () => void;
     /** Injectable for tests. Default: `Date.now`. */
     now?: () => number;
   }

   interface State { error: unknown | null }

   export class AppErrorBoundary extends Component<AppErrorBoundaryProps, State> {
     state: State = { error: null };

     static getDerivedStateFromError(error: unknown): State {
       return { error };
     }

     componentDidCatch(error: unknown, info: ErrorInfo): void {
       // Local only (AGENTS non-negotiable 8): no telemetry, just the console.
       console.error('[FieldMeasure] render error', error, info.componentStack);
       if (isChunkLoadError(error)) this.tryChunkReload();
     }

     private tryChunkReload(): void {
       const now = (this.props.now ?? Date.now)();
       let last = 0;
       try { last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0); } catch { /* storage blocked */ }
       if (now - last < CHUNK_RELOAD_WINDOW_MS) return; // already tried: show the fallback
       try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now)); } catch { /* storage blocked */ }
       (this.props.reload ?? (() => window.location.reload()))();
     }

     private reset = (): void => {
       this.setState({ error: null });
       this.props.onReset?.();
     };

     render(): ReactNode {
       if (this.state.error === null) return this.props.children;
       const reload = this.props.reload ?? (() => window.location.reload());
       return (
         <main className="error-fallback" role="alert">
           <h1 className="error-fallback-title">{COPY.title}</h1>
           <p className="error-fallback-body">{COPY.body}</p>
           <div className="error-fallback-actions">
             <button type="button" className="btn btn-primary hit-slop" onClick={reload}>
               {COPY.reload}
             </button>
             {this.props.variant === 'route' && this.props.onReset ? (
               <button type="button" className="btn btn-secondary hit-slop" onClick={this.reset}>
                 {COPY.backToProjects}
               </button>
             ) : null}
           </div>
         </main>
       );
     }
   }
   ```
3. `src/ui/errorBoundary.css`: centre the fallback, and use only existing CSS variables (copy the
   variable names used by `.home-empty` in `src/styles.css`, but do not edit `styles.css`).
   Buttons are at least 48 px tall (the touch floor). Example:
   ```css
   .error-fallback { min-height: 100dvh; display: grid; place-content: center; gap: 16px; padding: 16px; text-align: center; background: var(--g950, #0d1117); color: var(--g000, #fff); }
   .error-fallback-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
   .error-fallback-actions .btn { min-height: 48px; }
   ```
   First check that `--g950` and `--g000` exist with `grep -n "\-\-g950\|\-\-g000" src/styles.css`. Use
   variables that exist, and keep the literal fallbacks.

4. `src/ui/globalErrors.ts`:
   ```ts
   import { emitToast } from '@/editor/session';
   import { ERROR_BOUNDARY_COPY } from './errorBoundaryCopy';

   /** One toast per burst: a failing loop must not stack toasts (5 s). */
   export const GLOBAL_ERROR_DEDUPE_MS = 5000;

   export function installGlobalErrorHandlers(
     target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
     now: () => number = Date.now,
   ): () => void {
     let lastAt = -Infinity;
     const onRejection = (event: PromiseRejectionEvent): void => {
       const reason = event.reason as { name?: unknown } | undefined;
       // A cancelled picker or an aborted fetch is the user's choice, not a failure.
       if (reason && reason.name === 'AbortError') return;
       console.error('[FieldMeasure] unhandled rejection', event.reason);
       const t = now();
       if (t - lastAt < GLOBAL_ERROR_DEDUPE_MS) return;
       lastAt = t;
       emitToast({ text: ERROR_BOUNDARY_COPY.unexpected, urgent: true });
     };
     target.addEventListener('unhandledrejection', onRejection as EventListener);
     return () => target.removeEventListener('unhandledrejection', onRejection as EventListener);
   }
   ```
5. `src/main.tsx`: wrap the app and install handlers. Keep the existing TODO comment.
   ```tsx
   import { AppErrorBoundary } from './ui/ErrorBoundary';
   import { installGlobalErrorHandlers } from './ui/globalErrors';
   installGlobalErrorHandlers();
   createRoot(document.getElementById('root')!).render(
     <StrictMode>
       <AppErrorBoundary variant="app">
         <App />
       </AppErrorBoundary>
     </StrictMode>,
   );
   ```
6. Tests, `tests/errorBoundary.test.tsx` (jsdom). Silence expected console noise with
   `vi.spyOn(console, 'error').mockImplementation(() => {})` and restore it after each test.
   - renders children when nothing throws.
   - a child that throws `new Error('boom')` shows `COPY.title` and a `role="alert"`, and **no**
     «Back to Projects» button for `variant="app"`.
   - `variant="route"` with `onReset` shows «Back to Projects". Clicking it calls `onReset` and
     re-renders the children (use a `shouldThrow` flag you flip before clicking).
   - a chunk error (`new Error('Failed to fetch dynamically imported module: /assets/x.js')`)
     calls the injected `reload` exactly once. Rendering a second chunk error with `now` returning
     `+10_000` does **not** call it again. Call `sessionStorage.clear()` in `beforeEach`.
   - `isChunkLoadError` true or false table: three true messages, and `new Error('boom')` is false.
7. Tests, `tests/globalErrors.test.ts` (node). Pass a fake target
   (`{ addEventListener, removeEventListener }` backed by a `Map`) and a fake `now`. Subscribe with
   `subscribeToastMessage`. Cover: one toast for a rejection; AbortError gives no toast; two
   rejections 1 s apart give one toast; two rejections 6 s apart give two; the returned function detaches.

**Seams for the orchestrator (§5 step 3):** wrap routes in `App.tsx` and fold the copy.

---

### L3: First-run fixes (fixes F4a, F4b first half, F4c)

**Owns:** `src/ui/FirstRun.tsx`, `src/settings/projectsRoot.ts`, `+src/ui/onboardingCopy.ts`,
`+src/ui/firstRunNotice.css`, `tests/firstRun.test.tsx` (add cases only), `+tests/projectsRoot.test.ts`.
**Reads only:** `tests/fakes/fsa.ts`, `src/ui/Settings.tsx` (it calls `pickProjectsFolder()`
with no arguments; its behaviour must not change).

**Steps:**

1. `src/ui/onboardingCopy.ts`:
   ```ts
   /** Staged copy for D139 (L3). Folded into `STRINGS.firstRun` at integration. */
   export const ONBOARDING_COPY = {
     unsupportedTitle: "This browser can't save to folders",
     unsupportedBody: 'Open Field Measure in Microsoft Edge or Google Chrome on this PC to save projects to a folder.',
     pickFailed: "Couldn't use that folder. Choose a different one.",
   } as const;
   ```
2. `src/settings/projectsRoot.ts`:
   a. Export a support probe:
   ```ts
   /** True when this browser can pick a folder (File System Access, Chromium-only). */
   export function supportsFolderPicker(): boolean {
     return typeof globalThis.showDirectoryPicker === 'function';
   }
   ```
   b. Change the signature to `pickProjectsFolder(options?: { ensureChild?: string })`. After the
   picker resolves and **before** `setProjectsRoot`, add:
   ```ts
     let root = handle;
     // D139: «Use Documents\FieldMeasure» must really use a FieldMeasure folder. When the user picks
     // its parent (the picker opens in Documents, so «Select Folder» picks Documents itself), create
     // or reuse the named child instead of scanning every folder in Documents as a project.
     if (options?.ensureChild && handle.name.toLowerCase() !== options.ensureChild.toLowerCase()) {
       root = await handle.getDirectoryHandle(options.ensureChild, { create: true });
     }
     await setProjectsRoot(root);
     return root;
   ```
   (Rename the variables to fit. The function must return the handle it persisted.) Export
   `PROJECTS_CHILD_FOLDER = 'FieldMeasure'`, with a comment that it matches `SUGGESTED_PROJECTS_PATH`'s leaf.
   Calls with no arguments behave exactly as before.
3. `src/ui/FirstRun.tsx`:
   a. Import `supportsFolderPicker`, `PROJECTS_CHILD_FOLDER`, `ONBOARDING_COPY` and `./firstRunNotice.css`.
   b. `const supported = supportsFolderPicker();` (compute it once per render. It's cheap.)
   c. Add `const [pickError, setPickError] = useState(false);`.
   d. Change `chooseFolder` to take `useSuggested: boolean`. Call
      `pickProjectsFolder(useSuggested ? { ensureChild: PROJECTS_CHILD_FOLDER } : undefined)`. At
      the start, `setPickError(false)`. In the outer `catch`, `setPickError(true)`. A cancel still
      returns `null` and is **not** an error.
   e. Wire the buttons: «Use Documents\FieldMeasure» → `chooseFolder(true)`, «Choose folder» →
      `chooseFolder(false)`.
   f. If `!supported`, render **instead of both steps**:
      ```tsx
      <main className="first-run">
        <section className="first-run-step first-run-unsupported" role="alert" aria-labelledby="first-run-title">
          <h1 id="first-run-title" className="screen-title">{ONBOARDING_COPY.unsupportedTitle}</h1>
          <p className="first-run-notice-body">{ONBOARDING_COPY.unsupportedBody}</p>
        </section>
      </main>
      ```
      Put this as an early `return` **after** all hooks are declared (hooks must not be conditional).
   g. On step 2, when `pickError` is set, render `<p className="first-run-error" role="alert">{ONBOARDING_COPY.pickFailed}</p>`
      directly under the path readout.
   h. `firstRunNotice.css`: `.first-run-error` and `.first-run-notice-body` get readable colours from
      existing variables (check `grep -n "\-\-danger\|\-\-err\|--red" src/styles.css` and use one that
      exists; the grid's `.project-error-line` in `src/ui/projectScreen.css` is the reference look).
4. Tests, `tests/projectsRoot.test.ts` (node). Use `FakeDir` and `asDir` from `tests/fakes/fsa.ts`,
   and stub `globalThis.showDirectoryPicker = async () => asDir(pickedDir)`. Mock `idb-keyval`
   (`vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn() }))`) so persistence is observable.
   - picking `Documents` with `ensureChild: 'FieldMeasure'` creates a `FieldMeasure` child. The
     persisted and returned handle is the child (`name === 'FieldMeasure'`).
   - picking a folder already named `FieldMeasure` (any case) persists that folder with no child.
   - no options: the picked folder is persisted as-is (Settings' path is unchanged).
   - an `AbortError` returns `null`. Any other error rethrows.
   - `supportsFolderPicker()` is false when `showDirectoryPicker` is undefined.
   Delete `globalThis.showDirectoryPicker` in `afterEach`.
5. Tests, `tests/firstRun.test.tsx` (**add** cases, do not change existing ones):
   - with `showDirectoryPicker` undefined, the unsupported title and an alert render, and there are no step
     buttons.
   - a picker rejecting with `new Error('x')` shows `pickFailed` and stays on step 2. An
     `AbortError` does not show it.
   Check how the existing file stubs the picker first, and reuse that approach.

**Seams:** fold `ONBOARDING_COPY` into `STRINGS.firstRun`.

---

### L4: Scan hides non-project folders, runs in parallel, and exposes a cover reader (fixes F4b second half, supports F5)

**Owns:** `src/fs/projectStore.ts` (**only** the scan section: `scanOne`, `scanProjects`, plus the new
`readProjectCover`), `tests/projectStore.test.ts`.
**Does not touch:** the registry functions, `writeJsonAtomic`, or anything outside the scan section.

**Steps:**

1. Add a helper above `scanOne`:
   ```ts
   /** D140: a root subfolder is a project candidate only if it has `project.json` or its
    *  `.history/_project/` recovery folder. Anything else (Documents' "My Music", "Zoom", …) is not
    *  ours and is not shown. A folder with a CORRUPT project.json is still a candidate. */
   async function isProjectCandidate(dir: FileSystemDirectoryHandle): Promise<boolean> {
     try {
       await dir.getFileHandle('project.json', { create: false });
       return true;
     } catch { /* fall through */ }
     try {
       const history = await dir.getDirectoryHandle('.history', { create: false });
       await history.getDirectoryHandle('_project', { create: false });
       return true;
     } catch {
       return false;
     }
   }
   ```
   Check the real history layout first: `grep -n "tryResolveHistoryDir" -A12 src/fs/projectStore.ts`.
   If the folder names differ from `.history/_project`, use the real ones and say so in SURPRISES.
2. Rewrite the loop in `scanProjects` to skip dot-folders (`folderName.startsWith('.')`) and
   non-candidates, and to scan with bounded concurrency:
   ```ts
   /** Parallel folder reads during the Home scan: enough to hide per-folder latency on a large root,
    *  small enough not to flood the File System Access backend (8). */
   export const SCAN_CONCURRENCY = 8;
   ```
   Collect `[folderName, handle]` directory entries first, then process them in chunks of
   `SCAN_CONCURRENCY` with `Promise.all`. For each one, `if (!(await isProjectCandidate(dir))) return null;`,
   otherwise `scanOne(...)`, and filter out the nulls. Keep `annotateDuplicates` and the existing sort
   exactly.
3. Add the cover reader (Home thumbnails):
   ```ts
   /** D141: the Home card's cover, the `thumb.jpg` of the project's first live sheet by `sortIndex`.
    *  Read-only, resolves by FOLDER NAME from the root (Home has no open project), and is `null` on
    *  any failure: a missing cover is never an error. */
   export async function readProjectCover(folderName: string): Promise<Blob | null> {
     try {
       const root = await getRootDir();
       if (!root) return null;
       const dir = await root.getDirectoryHandle(folderName, { create: false });
       const file = await readProjectFile(dir);
       const first = [...file.sheets]
         .filter((s) => !s.deletedAt)
         .sort((a, b) => a.sortIndex - b.sortIndex)[0];
       if (!first) return null;
       const sheetDir = await resolveSheetDir(dir, first.id);
       const handle = await sheetDir.getFileHandle('thumb.jpg', { create: false });
       return await handle.getFile();
     } catch {
       return null;
     }
   }
   ```
   Confirm the field name `sortIndex` and the thumbnail filename in `src/domain/schema.ts` and
   `src/fs/projectSheets.ts` before relying on them. Adapt if they differ.
4. Tests in `tests/projectStore.test.ts`:
   a. **Change only the test at ~line 501** («reports an unreadable folder as a card instead of hiding it»)
      for **D140**. Rename it to `'reports a corrupt project as a card and hides non-project folders (D140)'`.
      Expect `['Broken']` only, with `status === 'unreadable'`. Add a comment `// D140 supersedes the NotAProject half`.
   b. Add: a folder with only `.history/_project/` (no `project.json`) **is** listed. Dot-folders are
      skipped. 20 project folders all come back sorted as before (this exercises the chunking).
   c. Add `readProjectCover` tests: returns the first-by-`sortIndex` live sheet's thumb bytes;
      returns `null` with no sheets, a missing thumb, or a missing folder.
   Build fixtures with the existing helpers in the file (`installRoot`, `validProjectFile`,
   `root.putFile`, `root.mkdir`).

**Seams:** the orchestrator wires `readProjectCover` into `ProjectList` as the default `loadCover`.

---

### L5: Home and grid polish (fixes F5, F2's missing recovery)

**Owns:** `src/ui/ProjectList.tsx`, `src/ui/ProjectScreen.tsx`, `src/ui/projectScreen.css`,
`+src/ui/home.css`, `+src/ui/homePolishCopy.ts`, `tests/projectList.test.tsx`,
`tests/projectScreen.test.tsx`.
**Must not import:** `readProjectCover` (L4 is writing it). Use the pinned prop below.

**Steps:**

1. `src/ui/homePolishCopy.ts`:
   ```ts
   /** Staged copy for D141/D142 (L5). Folded into `STRINGS.home` / `STRINGS.project` at integration. */
   export const HOME_POLISH_COPY = {
     projectCardMetaShort: '{sheetCount} · {time}',
     sheetCountOne: '1 sheet',
   } as const;
   ```
   (`STRINGS.project.sheetCount` = `'{sheetCount} sheets'` already exists and stays the plural.)
2. Add a shared pure helper **in `ProjectScreen.tsx`** (exported) so both screens use one rule:
   ```ts
   /** D141/D142: «1 sheet» / «N sheets». */
   export function sheetCountLabel(count: number): string {
     return count === 1 ? HOME_POLISH_COPY.sheetCountOne : t(STRINGS.project.sheetCount, { sheetCount: count });
   }
   ```
3. **`ProjectScreen.tsx`**
   a. Header count: replace `t(STRINGS.project.sheetCount, { sheetCount })` with `sheetCountLabel(sheetCount)`,
      and render the count span only when `state !== 'error'`.
   b. Add an optional prop `onRetry?(): void;` to `ProjectScreenProps` with a doc comment
      (`D142: the error state's recovery; absent → no button, never a dead control`). Destructure it.
   c. In the `state === 'error'` block, render a Retry button after the message **when `onRetry` is set**:
      ```tsx
      <p className="project-error-line" role="alert">
        {STRINGS.project.loadError}
        {onRetry ? (
          <button type="button" className="btn btn-secondary hit-slop project-error-retry" onClick={onRetry}>
            {STRINGS.errors.retry}
          </button>
        ) : null}
      </p>
      ```
      Add `.project-error-retry { margin-left: 12px; min-height: 48px; }` to `projectScreen.css`, and make
      `.project-error-line` `display: flex; align-items: center; justify-content: space-between;` if it
      is not already flex.
   d. **Card overlap check.** In the review screenshot at 1440x960, a control appeared to sit on top of the
      sheet card's meta line (`.sheet-card-meta`) at the bottom-left. Before changing CSS, open
      `ProjectScreen.tsx` around the card markup (search `sheet-card-meta mono`) and list every
      absolutely positioned child of the card with its CSS (`grep -n "position: absolute" -B3 src/ui/projectScreen.css`).
      If an absolutely positioned control's box intersects the meta row, give `.sheet-card-meta` (or its
      row container) enough `padding-left`/`padding-right` to clear that control's width plus 8 px, and
      say which control it was. If no overlap is found in the code, change nothing and report
      "no overlap found in CSS; needs orchestrator screenshot check".
4. **`ProjectList.tsx`**
   a. **Remove** the disabled secondary card (the `<button … className="btn project-card project-card-secondary …">`
      with `STRINGS.home.openExistingFolder`) and the disabled `openExistingFolderEmpty` button in the empty
      state. Keep the `onOpenFolder` prop in the interface (App still passes it) and add a comment:
      `// D141: adoption is unbuilt, so its controls are hidden rather than shown disabled.`
      Leave the «Locate» link on unreadable cards as it is (out of scope).
   b. Meta line: find the `t(STRINGS.home.projectCardMeta, { ... })` call (it passes U+2014
      placeholders for `size` and `time`; `grep -n "projectCardMeta" src/ui/ProjectList.tsx`) and
      replace the whole call with:
      ```ts
      t(HOME_POLISH_COPY.projectCardMetaShort, { sheetCount: sheetCountLabel(card.sheetCount), time: cardTimeLabel(card.updatedAtMs) })
      ```
      Add `updatedAtMs: number` to `CardModel` (from `entry.updatedAtMs` in `fromScan`, `0` in
      `fromSummary`). Add a pure exported helper:
      ```ts
      /** D141: today → the clock (`2:14 PM`, the grid's `clockLabel`); otherwise a short date (`Sep 24`); 0 → ''. */
      export function cardTimeLabel(ms: number, now: Date = new Date()): string
      ```
      Use `clockLabel` from `@/fs/projectSheets` for today, and
      `new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })` otherwise. When the
      label is `''`, render only the sheet count (no trailing ` · `).
   c. Cover thumbnail: add the prop
      ```ts
      /** D141: loads a card's cover image. The shell wires `projectStore.readProjectCover`; absent → no image. */
      loadCover?: (folderName: string) => Promise<Blob | null>;
      ```
      Create a small `ProjectCover` component in the same file. Given `folderName` and `loadCover`, it loads
      once in a `useEffect`, creates an object URL, renders
      `<img className="project-card-cover" src={url} alt="" />` inside the existing
      `.project-card-thumb` span, and **revokes the URL** in cleanup (with an `alive` flag for late
      resolves). With no `loadCover` or a `null` blob it renders the existing empty span plus a lucide
      `Image` icon at 32 px (`aria-hidden="true"`).
   d. `home.css` (imported by `ProjectList.tsx`): `.project-card-cover { width: 100%; height: 100%; object-fit: cover; display: block; }`
      and centre the fallback icon with low-contrast colour from existing variables.
5. Tests:
   a. `tests/projectList.test.tsx`: **change only** the two named tests for **D141**:
      - `~line 82-88` (empty-state «Open an existing folder…» disabled) → assert it is **absent**
        (`queryByRole(...)` is `null`). Add `// D141` in a comment.
      - `~line 173-187` («renders the «Open existing folder…» card disabled and inert») → rename to
        `'does not render the unbuilt «Open existing folder…» card (D141)'` and assert absence.
      Add: meta shows `1 sheet` for one sheet and `3 sheets` for three; `cardTimeLabel` table (same day,
      another day, 0); `loadCover` resolving a Blob renders an `img` with a `blob:` URL (stub
      `URL.createObjectURL`/`revokeObjectURL` with `vi.fn`); unmount calls `revokeObjectURL`.
   b. `tests/projectScreen.test.tsx`: `state="error"` with `onRetry` renders «Retry» and clicking calls it;
      without `onRetry`, there is no Retry button; the header count is hidden in error; `sheetCount={1}` renders `1 sheet`.

**Seams:** wire `onRetry` and `loadCover` in `App.tsx`, and fold the copy.

---

### L6: Journey e2e gate and container-friendly browser runners (fixes C5; locks F1 and F2)

**Owns:** `+tests/e2e/journey.spec.ts`, `playwright.config.ts`, `vitest.config.ts`.
**Reads only:** `tests/clickthru/harness.ts` (`clickthruInitScript`, `opfsFirstMarkup`),
`tests/clickthru/gestures.ts` (`Gestures`). Both are stable, committed files.
**Verification:** lanes may not run Playwright (§1.4). Run `tsc` and the node + jsdom Vitest projects only.
The orchestrator runs the spec. **It is expected to FAIL on the "exit" tests until L1 lands**, which is
the point.

**Steps:**

1. `playwright.config.ts`: inside `use`, add (keep everything else):
   ```ts
    // D143: a container whose Playwright build has no matching bundled browser can point at a local
    // Chromium. Unset (the Windows build machine), nothing changes.
    ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
   ```
2. `vitest.config.ts`: change `provider: playwright(),` to
   ```ts
            // D143: same escape hatch as playwright.config.ts (verified in session 27 with
            // PW_CHROMIUM_PATH=/opt/pw-browsers/chromium plus --browser.headless).
            provider: playwright(
              process.env.PW_CHROMIUM_PATH
                ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
                : {},
            ),
   ```
3. `tests/e2e/journey.spec.ts`. This code was proven against the built app in session 27 (the
   "exit" assertions failed as expected on the pre-fix tree):
   ```ts
   /**
    * D143: the journey gate. Screen-to-screen transitions that no unit test covers:
    * first run → new project → capture → editor → edit → back to the grid → Home.
    * Uses the clickthru's OPFS folder shim and CDP pen helper. It is NOT the clickthru (that stays
    * an inspection tool). This is a small, headless, deterministic gate.
    */
   import { expect, test, type Page } from '@playwright/test';
   import { clickthruInitScript, opfsFirstMarkup } from '../clickthru/harness';
   import { Gestures } from '../clickthru/gestures';

   test.use({
     viewport: { width: 1440, height: 960 },
     hasTouch: true,
     launchOptions: {
       args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
       ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
     },
   });

   async function toEditorWithOneSheet(page: Page, name: string): Promise<void> {
     await page.addInitScript(clickthruInitScript);
     await page.goto('/');
     await page.getByRole('radio', { name: 'Right', exact: true }).click();
     await page.locator('.first-run-actions .btn-primary').click();
     await expect(page.locator('h1.home-mark')).toBeVisible();
     await page.getByRole('button', { name: 'New project', exact: true }).click();
     await page.getByRole('textbox', { name: 'Project name' }).fill(name);
     await page.getByRole('button', { name: 'Create project', exact: true }).click();
     await expect(page.locator('.camera-shutter')).toBeVisible({ timeout: 30_000 });
     await page.waitForTimeout(1500); // the fake camera stream needs a moment before the shutter captures a frame
     await page.locator('.camera-shutter').click();
     await page.locator('.camera-review-primary').click({ timeout: 30_000 });
     await page.locator('[data-sheet-id] .sheet-card-open').first().click({ timeout: 60_000 });
     await expect(page.locator('.editor-canvas')).toBeVisible({ timeout: 40_000 });
     await page.waitForTimeout(1000); // the photo decode + fit settle before input
   }

   async function penStrokeOnCanvas(page: Page, gestures: Gestures): Promise<void> {
     await page.locator('[data-testid="tool-rail"] [data-tool="freehand"]').click();
     const box = (await page.locator('.editor-canvas').boundingBox())!;
     const at = (fx: number, fy: number) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });
     await gestures.penStroke([at(0.3, 0.5), at(0.4, 0.6), at(0.5, 0.5), at(0.6, 0.6)], { force: 0.6 });
   }

   test('editor → Projects returns to a working grid (F2)', async ({ page }) => {
     await toEditorWithOneSheet(page, 'Journey grid');
     await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
     await expect(page.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 10_000 });
     await expect(page.locator('.project-error-line')).toHaveCount(0);
   });

   test('an edit made just before leaving is saved (F1)', async ({ page, context }) => {
     await toEditorWithOneSheet(page, 'Journey save');
     const gestures = await Gestures.attach(page, context);
     await penStrokeOnCanvas(page, gestures);
     // No wait: tap Projects inside the 400 ms autosave coalesce window.
     await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
     await expect(page.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 10_000 });
     await expect.poll(async () => (await opfsFirstMarkup(page)).length, { timeout: 5_000 }).toBe(1);
   });

   test('grid → Home → reopen still loads the sheet', async ({ page }) => {
     await toEditorWithOneSheet(page, 'Journey reopen');
     await page.getByRole('button', { name: 'Projects', exact: true }).first().click();
     await expect(page.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 10_000 });
     await page.getByRole('button', { name: 'Back to Projects' }).click();
     await expect(page.locator('h1.home-mark')).toBeVisible();
     await page.getByRole('button', { name: 'Journey reopen' }).click();
     await expect(page.locator('[data-sheet-id]')).toHaveCount(1, { timeout: 10_000 });
   });
   ```
   Before finishing, confirm by reading the harness that `clickthruInitScript`, `opfsFirstMarkup` and
   `Gestures.attach(page, context)` exist with these signatures (`grep -n "export" tests/clickthru/harness.ts tests/clickthru/gestures.ts`).
   Confirm the Home card's accessible name is the project title (`ProjectList.tsx`: `aria-label={card.title}`),
   and that the grid's back control's accessible name is `STRINGS.a11y.backToProjects` («Back to Projects»).
   Adjust the selectors if not, and report it.

**Seams:** none. The orchestrator runs it (§5 step 5).

---

## 5. Wave 1 integration (orchestrator)

Follow runbook §11's integration checklist. In order:

1. **Read every diff** (`git diff --stat`, then per file). Check that each lane stayed inside its owned files:
   `git diff --name-only` must be the union of the owned lists. Revert anything outside.
2. **Fold staged copy into `src/ui/strings.ts`**, then delete the five `*Copy.ts` staging modules and
   repoint their imports to `STRINGS.*`:
   | Staging key | → `STRINGS` key |
   |---|---|
   | `EXIT_SAVE_COPY.exitSaveFailed` | `editor.exitSaveFailed` |
   | `ERROR_BOUNDARY_COPY.*` | new section `errorBoundary.{title,body,reload,backToProjects,unexpected}` |
   | `ONBOARDING_COPY.*` | `firstRun.{unsupportedTitle,unsupportedBody,pickFailed}` |
   | `HOME_POLISH_COPY.projectCardMetaShort` | `home.projectCardMetaShort` |
   | `HOME_POLISH_COPY.sheetCountOne` | `project.sheetCountOne` |
   Every new key sits under a **copy of the existing proposed-copy marker comment** (copy the exact line
   from `src/ui/strings.ts:11`, the "beyond the gaps appendix" variant). `tests/strings.test.ts` enforces
   this. Also add the new rows to `docs/appendix-strings-gaps.md` as proposals awaiting the content owner.
3. **Wire the seams in `src/App.tsx`:**
   ```tsx
   import { AppErrorBoundary } from '@/ui/ErrorBoundary';
   import { readProjectCover } from '@/fs/projectStore';   // merge into the existing import
   // in the return: wrap the route
   <AppErrorBoundary variant="route" key={route} onReset={() => { setCaptureOpen(false); setRoute('home'); }}>
     {renderRoute()}
   </AppErrorBoundary>
   // the capture overlay: wrap the <Suspense> around <CameraFlow> in
   <AppErrorBoundary variant="route" onReset={() => setCaptureOpen(false)}> … </AppErrorBoundary>
   // ProjectScreen:
   onRetry={() => { registerOpenProject(editorTarget.projectId, editorTarget.folderName); setProjectRefresh((n) => n + 1); }}
   // ProjectList:
   loadCover={readProjectCover}
   ```
   `key={route}` resets the boundary on every navigation.
4. **Full machine gate** (Linux container shown. On Windows drop the env var and `--browser.headless`):
   ```bash
   npx tsc --noEmit
   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx vitest run --browser.headless
   npm run build
   ```
5. **Journey gate** (new, D143). It must pass all three tests:
   ```bash
   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test tests/e2e/journey.spec.ts
   PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npx playwright test          # the whole e2e suite
   ```
   If the F1 test fails, check L1 step 1 first (flush ordering), then L1 step 3 (the exit path must
   go through `exitAfterSave`).
6. **Clickthru** (inspection, never a gate): `npm run clickthru` on the Windows machine. Read the
   contact sheet for Home (cover image, no disabled card, `N sheets · time`), the grid after exiting
   the editor, and first run. The clickthru is headed and Windows-oriented, so if it can't run in the
   container, record that in BUILD-LOG instead of skipping it silently.
7. **Manual spot checks to record in BUILD-LOG:** throw inside a route component temporarily (not
   committed) and see the fallback; set `showDirectoryPicker` to `undefined` in DevTools and reload to
   see the unsupported notice.
8. **Docs:** finish D137 to D143 in `DECISIONS.md` (for D140 and D141, show why the old assertions
   were superseded). Add the BUILD-LOG entry (template in `docs/BUILD-LOG.md`, "Surprises" is mandatory)
   and the CONTINUITY snapshot. In `HARDWARE-TEST-CHECKLIST.md`, add `[Surface]` rows for: first run
   picking real `Documents`, exiting the editor right after a real pen stroke, and the unsupported
   notice in a non-Chromium browser.
9. **Commits**, one per lane-slice with the decision in the subject, each including its BUILD-LOG
   lines:
   `fix(D137): the editor saves before it leaves, and the shell owns project registration`,
   `feat(D138): error boundaries and a global rejection toast`,
   `fix(D139): first run uses a real FieldMeasure folder and says when it cannot`,
   `fix(D140): Home ignores folders that are not projects; scan in parallel`,
   `feat(D141-D142): Home covers and real meta, no dead controls; grid Retry`,
   `test(D143): the journey e2e gate; env-selectable Chromium for both runners`.
   Then `git push -u origin claude/quirky-ramanujan-4xn374`.

---

## 6. Wave 2 pre-flight (orchestrator)

Wave 1 is committed and green. Take a fresh baseline. Refactors are **behaviour-preserving**: no test
changes other than **new** tests, and the journey gate plus the full Vitest suite must stay green
after every step. Each refactor lane does its work as a sequence of small steps and runs
`tsc` + node/jsdom Vitest **after every step**. If a step breaks something it can't fix in two tries,
revert that step (`git checkout -- <file>`) and report.

Wave 2 file ownership (disjoint):
| Lane | Owns |
|---|---|
| R1 | `src/ui/SheetEditor.tsx`, `+src/editor/gestureArbiter.ts`, `+tests/gestureArbiter.test.ts` |
| R2 | `src/App.tsx`, `+src/ui/appRoute.ts`, `+src/ui/useProjectActions.ts`, `+tests/appRoute.test.ts` |
| R3 | `src/ui/ProjectScreen.tsx`, `+src/ui/useSheetReorderDrag.ts` |
| R4 | `src/ui/CameraFlow.tsx`, `+src/media/cameraSession.ts`, `+tests/cameraSession.test.ts` |

## 7. Wave 2 lane briefs (refactors)

### R1: Extract the gesture engine from `SheetEditor` (C1, step 1 of 2)

**Goal:** move the hand-written pointer logic (the `contacts` / `objectDrags` / `lastTap` state and
`onPointerDown`, `onPointerMove`, `endContact`, `cancelContact`, plus their private helpers
`placementArmed`, `markupPointerDown/Move/Up`, `markupToolPending`, `isAtEdge`) out of the mega-effect
into `src/editor/gestureArbiter.ts`. **No behaviour change.**

**Method (mechanical, do not redesign):**
1. Create `gestureArbiter.ts` exporting `interface GestureDeps { … }` and
   `class GestureArbiter { constructor(deps: GestureDeps); onPointerDown(e); onPointerMove(e); onPointerUp(e); onPointerCancel(e); dispose() }`.
2. **Cut** the handler bodies from `SheetEditor.tsx` (search `const contacts = new Map<number, Contact>();`
   through the end of `cancelContact`) and paste them as methods. Keep local state (`contacts`,
   `objectDrags`, `lastTap`) as private fields.
3. Run `npx tsc --noEmit`. Every error "Cannot find name X" is a free variable of the old closure.
   For each one, add a member to `GestureDeps`:
   - a ref (`fooRef`) → a getter `getFoo(): T` implemented as `() => fooRef.current`;
   - an effect-local object (`canvas`, `scene`, `history`, `tool`, `loupe`, `router`) → a readonly field;
   - a setter (`setPlacement`, …) → a callback field with the same signature;
   - an imported pure function → import it in `gestureArbiter.ts` directly.
   Repeat until `tsc` is clean. Use no `any` and no non-null assertions except where the original
   code had them.
4. In the effect, construct `const arbiter = new GestureArbiter({ … })` in the same place the
   handlers used to be defined. Register `arbiter.onPointerDown.bind(arbiter)` (and the others) with
   the same `host.addEventListener` calls, and remove them in cleanup exactly as before.
5. `tests/gestureArbiter.test.ts` (node): characterization tests with fake deps for tap versus drag
   (`TAP_SLOP`), a long press (`LONG_PRESS_MS`, with `vi.useFakeTimers()`), a second finger restoring a drag
   (`onSecondFinger`), and a pen barrel button (`buttons: 2`) not drawing. Build `PointerEvent`-like
   plain objects with only the fields the code reads.
6. Report the line count of `SheetEditor.tsx` before and after (target: at least 450 lines smaller).
Orchestrator gate: the full Vitest suite, including the browser project's `sheetEditor*.browser.test.ts`
and `markupTools.browser.test.ts`, the journey gate, and clickthru 20/20 on the gesture-lab steps.

### R2: App route as a reducer and project actions as a hook (C3)

1. `src/ui/appRoute.ts`: pure, no React.
   ```ts
   export interface ProjectRef { projectId: string; folderName: string }
   export type AppRoute =
     | { name: 'loading' } | { name: 'first-run' } | { name: 'home' } | { name: 'settings' }
     | { name: 'project'; project: ProjectRef }
     | { name: 'editor'; project: ProjectRef; sheetId?: string; intent: 'none' | 'import' | 'export' };
   export type AppRouteAction =
     | { type: 'booted'; hasRoot: boolean } | { type: 'firstRunDone' } | { type: 'openSettings' }
     | { type: 'goHome' } | { type: 'openProject'; project: ProjectRef }
     | { type: 'openSheet'; sheetId: string } | { type: 'openImport' } | { type: 'openExport' }
     | { type: 'exitEditor' };
   export function appRouteReducer(state: AppRoute, action: AppRouteAction): AppRoute;
   ```
   Illegal transitions (for example `openSheet` while on Home) return `state` unchanged. Never throw.
2. `tests/appRoute.test.ts` (node): a transition table covering every action from every route.
3. In `App.tsx`, replace `route` + `editorTarget` + `editorSheetId` + `importOnOpen` with
   `useReducer(appRouteReducer, { name: 'loading' })`. Translate each `setRoute(...)` call site one-to-one
   into a `dispatch`. `renderRoute` switches on `route.name`, so the old `route === 'editor' && editorTarget`
   fall-through disappears because the project is carried by the route itself.
4. Move `handleDeleteSheet`, `handleRestoreSheet`, `handleReorderSheets`, `handleRenameSheet`,
   `handleDuplicateSheet`, `onReplacePhotoPicked`, `handleResolveReplace` and `loadTrash`, **verbatim**,
   into `useProjectActions(project: ProjectRef | null, onChanged: () => void)` in `src/ui/useProjectActions.ts`.
   It returns the same functions and the trash/replace state they use.
5. Existing `tests/app*.test.tsx` must pass unmodified. If one relies on an internal that moved, stop
   and report. Don't edit it.

### R3: Extract the sheet drag-reorder from `ProjectScreen` (C4)

Move the drag-reorder and autoscroll refs, effects and pointer handlers (search `onGridPointerDown` and
the refs it uses) into `useSheetReorderDrag({ gridRef, order, onCommit, enabled })` in
`src/ui/useSheetReorderDrag.ts`. It returns the handlers plus the live `renderOrder`. Use the same method
as R1 (cut, compile, turn free variables into hook parameters). The pure logic already lives in
`src/ui/sheetReorder.ts`, so reuse it and don't duplicate it. Gate: `gridReorder.browser.test.ts`,
`gridScroll.browser.test.ts`, `gridA11y.browser.test.ts` and `projectScreen.test.tsx` unchanged and
green (the orchestrator runs the browser ones).

### R4: Extract the camera session from `CameraFlow` (C4)

Move `getUserMedia` acquisition, track or zoom capability probing, digital-zoom crop, frame capture
and stream teardown into `class CameraSession` in `src/media/cameraSession.ts`, with methods
`start(constraints)`, `setZoom(level)`, `capture(): Promise<Blob>`, `stop()` and a `status` getter. The UI
states stay in `CameraFlow`. Every `catch` that exists today must keep its behaviour. List them before
and after in your report (there are 16 now). Add `tests/cameraSession.test.ts` (node) with a fake
`MediaStream`/`MediaStreamTrack` covering zoom clamping, a digital-zoom fallback when the track has no
`zoom` capability, and `stop()` stopping every track once. `cameraFlow.test.tsx` and
`cameraFallback.test.tsx` must stay green unmodified.

---

## 8. Wave 3: cross-cutting (serial, one lane at a time)

### R5: `ProjectSession`, one owner for a project's lifecycle (C2, the structural fix behind F1 and F2)

Create `src/fs/projectSession.ts`:
```ts
export interface ProjectSession {
  readonly key: string;            // D51 runtime key `${id}:${folderName}`
  readonly folderName: string;
  dir(): Promise<FileSystemDirectoryHandle>;
  readonly persist: PersistQueue;  // ONE queue per open project (not per editor mount)
  lease(): WriterLease | null;     // acquired on open
  close(): Promise<void>;          // flush → release lease → close channel → deregister
}
export async function openProjectSession(key: string, folderName: string): Promise<ProjectSession>;
```
- `App` opens the session on `openProject` or new-project, and `await session.close()` runs on
  «Back to Projects». It is provided through `ProjectSessionContext` (`src/ui/projectSessionContext.ts`).
- `SheetEditor` consumes `session.persist` and `session.lease()` instead of creating its own queue and
  lease. Its cleanup no longer flushes, releases or deregisters; it only detaches its scene.
- The `persistQueue`'s `defaultWrite` resolves through the session (a closure capturing `dir`), so writes
  no longer depend on the module registry. `registerOpenProject`/`clearOpenProject` become internal to
  `projectSession.ts`. Keep them exported for the tests that use them.
- Tests: `tests/projectSession.test.ts` (node, `tests/fakes/fsa.ts`): `close()` lands a pending write
  before releasing the lease; two `openProjectSession` calls for one key share one queue (refcount);
  a write after `close()` rejects with a typed error.
- **Two-tab lease semantics must not change.** `writerLease.browser.test.ts` stays green unmodified.

### R6: `EditorController` and the tool registry (C1, step 2 of 2)

After R1 and R5: move the canvas, scene, history, loupe, the tool instances and their store
subscriptions from the mega-effect into `src/editor/editorController.ts`
(`class EditorController { constructor(host, session, deps); loadSheet(id): Promise<EditorStatus>; dispose() }`).
Replace the nine tool refs with `Map<ToolId, Tool>` where `interface Tool { dispose(): void }` (extend it
only with methods every tool already has). **Changing sheets calls `controller.loadSheet(id)` instead of
remounting everything**: remove `sheetId` from the effect's dependencies. Undo history per sheet then
resets explicitly in `loadSheet` (`history.clear()`), which matches today's behaviour where a remount
cleared it. Record that as a decision. Target: `SheetEditor.tsx` under 1,200 lines, with the effect under
150 lines. Gate: everything in §5 steps 4 to 6.

---

## 9. Wave 4: documentation diet (R7, owner sign-off required first)

Only after the owner approves the proposal. The orchestrator asks, and doesn't assume.
- `CONTINUITY.md`: keep **one screen** (the snapshot table plus the "owed" list). Move the timeline to
  `docs/archive/continuity-timeline.md`.
- `DECISIONS.md`: split into `docs/decisions/D001-D099.md` and `D100-D199.md`, with an index table (number,
  title, status) in `DECISIONS.md`.
- `AGENTS.md` "Start here": reduce the required reading to CONTINUITY (one screen) + the runbook
  sections §3, §5, §9 and §11 + the slice's plan entry. Everything else becomes "consult when needed".
- Code comments: a rule for **new** code only. Say *why*, and cite a decision only when the reason is
  non-obvious. Don't mass-edit existing comments (churn with no value).

---

## 10. Risk register

| Risk | Where | Mitigation |
|---|---|---|
| Exit feels slow on a slow disk | L1 | A coalesced write normally lands in well under 1 s. The 8 s cap and a second-tap escape hatch prevent a trap. Watch in the `[Surface]` pass |
| Forced exit after a failed save orphans a parked write | L1 | The toast says so explicitly. R5 removes the orphan by giving the queue a project lifetime |
| An auto-reload loop on a chunk error | L2 | A sessionStorage guard with a 60 s window, tested |
| Hiding folders hides a real project with no `project.json` and no history | L4 | Such a folder is unrecoverable by the app anyway (it can't open it today either). The rule is recorded in D140 and the owner can reverse it |
| Lanes collide on a file | All | Disjoint ownership tables. The orchestrator checks `git diff --name-only` per lane |
| Refactor regressions | R1 to R6 | Behaviour-preserving steps, characterization tests first, and the journey gate plus the browser suite after every lane |
| A proposed-copy marker typo fails `strings.test.ts` | Integration | Copy the marker line from `strings.ts:11`. Never retype it |

**Rollback:** each lane is its own commit, so `git revert <sha>` isolates any one fix.

---

## Appendix A: lane prompt template (the orchestrator fills the angle brackets)

```
You are lane <ID> on the Field Measure repo at /home/user/FieldMeasure, branch
claude/quirky-ramanujan-4xn374. Other lanes are editing other files at the same time.

Read docs/beta-readiness-fix-plan.md §1 (rules) and your brief, §<section> "<ID>: …".
Do exactly the brief's steps, in order. Edit ONLY the files it lists under "Owns".
Do not commit, push, run npm run build, run Playwright, or edit docs/**.
Verify with: npx tsc --noEmit && npx vitest run --project node --project jsdom
Finish with the report in §1.6.
```

## Appendix B: evidence from the session-27 review (for the BUILD-LOG "Surprises")

- F1 probe: pen stroke, then «Projects» at 0 ms gave `objectsOnDisk=0` after 16 s. At 1500 ms it gave `objectsOnDisk=1`.
- F2 probe: after editor → «Projects», `.project-error-line` count was 1 and the sheet cards count was 0, while the
  header read «1 sheets».
- F4a probe: `showDirectoryPicker` undefined meant still on step 2 with 0 `role="alert"` elements.
- Gates at plan time: `tsc` 0, node + jsdom **1302/1302**, `npm run build` 0 (28 precache entries).
  The browser project and e2e need `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` plus headless in the cloud
  container (verified with `tests/browser.smoke.browser.test.ts`).
