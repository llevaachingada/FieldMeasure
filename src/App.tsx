/**
 * App shell routing (implementation plan slice 0.3 step 6; slice 1.3 adds the editor;
 * slice 1.4.5 wraps it in the lazy `EditorLayout` shell).
 *
 *   first-run → Home → Settings
 *                    └→ Editor (a project's first sheet), lazy-loaded
 *
 * There is no router dependency (closed dep list §2.2): a tiny route state keeps
 * the shell honest until the real navigation lands. First run is considered done
 * once a projects-root handle has been persisted (`fm:projects-root`).
 *
 * D51 — the runtime `projectId` handed to the editor is `scanProjects()`'s
 * `ScannedProject.key` (`id:folderName`), composed here from `ProjectList`'s
 * `onOpenProject(id, folderName)`. Passing the bare `id` would let two same-id
 * folders collide in the Web Lock / open-project registry / persistQueue.
 */
import { lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';
import FirstRun from '@/ui/FirstRun';
import ProjectList from '@/ui/ProjectList';
import Settings from '@/ui/Settings';
import ToastHost from '@/ui/Toast';
import PWAUpdate from '@/ui/PWAUpdate';
import { useThemeRuntime } from '@/ui/themeRuntime';
import { useWatermarkRuntime } from '@/ui/watermarkRuntime';
import WatermarkOverlay from '@/ui/WatermarkOverlay';
import NewProjectDialog from '@/ui/NewProjectDialog';
import { emitToast } from '@/editor/session';
import ProjectScreen from '@/ui/ProjectScreen';
import { listProjectSheets, type ProjectSheetCard } from '@/fs/projectSheets';
import { clearOpenProject, createProject, ensureRootAccess, readProjectCover, readProjectFile, registerOpenProject, resolveOpenProjectDir } from '@/fs/projectStore';
import { AppErrorBoundary } from '@/ui/ErrorBoundary';
import { pruneTrash } from '@/fs/sheetTrash';
import { acquireProjectSession } from '@/fs/projectSession';
import { appRouteReducer } from '@/ui/appRoute';
import { useProjectActions } from '@/ui/useProjectActions';
import { STRINGS } from '@/ui/strings';
import { getProjectsRoot } from '@/settings/projectsRoot';
import { getExportLocation } from '@/settings/exportLocation';
import { useAppStore } from '@/state/appStore';

/**
 * The editor shell (top bar, tool rail, dock and the Konva canvas behind it) is
 * **lazy-loaded** so Konva leaves the Home route's bundle. Slice 1.3 shipped a
 * ~547 kB main chunk by importing `SheetEditor` statically; importing the shell
 * dynamically splits the whole editor — Konva included — into its own chunk.
 */
const EditorLayout = lazy(() => import('@/ui/EditorLayout'));
/**
 * The capture flow is lazy for the same reason: it pulls `normalizeImage`, `exif`
 * and the thumbnail scheduler, which the Home route never needs.
 */
const CameraFlow = lazy(() => import('@/ui/CameraFlow'));


/**
 * D153 (owner report: «Folder permission expired» when taking new photos, over and over).
 * Chromium keeps the projects-folder HANDLE across restarts but drops its WRITE grant, and a
 * grant can only be re-asked for inside a tap. The camera used to ask first at «Use photo», after
 * the shot, and a missed or slow prompt failed the save. Asking here, at the taps that START work
 * (open a project, Take photo, Add sheet; New project asks in `createProject`), puts the one
 * prompt per browser session before the camera, so the save finds the grant already held.
 * Fire-and-forget on purpose: it queries first (free and silent while the grant is held), never
 * throws, and the camera's own ask at «Use photo» stays as the fallback.
 */
function requestFolderAccess(): void {
  void ensureRootAccess({ request: true }).catch(() => false);
}

export default function App() {
  // Display theme (slice 1.10): applies `<html data-theme="…">` and hydrates the
  // persisted choice on boot. Runs for every route — chrome is themed app-wide.
  useThemeRuntime();
  useWatermarkRuntime();

  /** R2: one route value; the project travels inside it (see `appRoute.ts`). */
  const [route, dispatch] = useReducer(appRouteReducer, { name: 'loading' });
  const editorTarget = route.name === 'project' || route.name === 'editor' ? route.project : null;
  /** Slice 1.4: the editor's «Add sheet» opens the capture flow over the editor. */
  const [captureOpen, setCaptureOpen] = useState(false);
  /**
   * Slice 1.10: the Project screen (the sheets grid, UI §11.2) — its loaded model, its
   * state, and a refresh counter bumped after a capture/import writes a new sheet.
   */
  const [projectSheets, setProjectSheets] = useState<readonly ProjectSheetCard[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectLoad, setProjectLoad] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [projectRefresh, setProjectRefresh] = useState(0);
  /** The grid's batch-export selection (empty = every sheet). */
  const [selectedSheetIds, setSelectedSheetIds] = useState<readonly string[]>([]);
  /** A grid «Export» hand-off: the selection the wizard must open already scoped to. */
  const [pendingExportSelection, setPendingExportSelection] = useState<readonly string[] | null>(null);
  /** R2: the grid's card actions and the trash / replace state they own. */
  const {
    trashItems,
    trashRestoreFailed,
    setTrashRestoreFailed,
    replacePrompt,
    replaceInputRef,
    loadTrash,
    handleDeleteSheet,
    handleRestoreSheet,
    handleReorderSheets,
    handleRenameSheet,
    handleDuplicateSheet,
    handleReplacePhoto,
    onReplacePhotoPicked,
    handleResolveReplace,
  } = useProjectActions(
    editorTarget,
    () => setProjectRefresh((n) => n + 1),
    (id) => setSelectedSheetIds((ids) => ids.filter((x) => x !== id)),
  );
  /**
   * «New project» runs an async folder create. The flag makes a double-tap a no-op
   * (two clicks before the first create resolves must not mint two projects); the
   * button itself stays enabled and no spinner/copy is added.
   */
  const creatingProject = useRef(false);
  /** The «New project» name pop-up (D135): Home's button only OPENS it; the create runs on confirm. */
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectBusy, setNewProjectBusy] = useState(false);

  /**
   * Slice 1.10: open a project on the **Project screen** (the sheets grid, UI §11.2; build
   * spec §20.5(a)) rather than straight into the editor. The grid is where a project's
   * sheets, its two add affordances and its export live.
   *
   * `registerOpenProject` is what makes the folder resolvable at all: the store's
   * open-project registry is keyed `${id}:${folderName}` (D51) and the grid's loader
   * resolves through it.
   */
  function openProject(id: string, folderName: string): void {
    if (!id || !folderName) return;
    requestFolderAccess();
    // D51: the registry — and therefore every resolver — is keyed by the FULL runtime key.
    // Registering the bare id leaves `resolveOpenProjectDir` unable to find the folder.
    const projectId = `${id}:${folderName}`;
    registerOpenProject(projectId, folderName);
    setSelectedSheetIds([]);
    setCaptureOpen(false);
    setProjectLoad('loading');
    dispatch({ type: 'openProject', project: { projectId, folderName } });
  }


  /**
   * R5 (D144): the shell holds the open project's session (its persist queue, writer lease and
   * channel) for as long as the project is open, across the grid and every editor mount. Whatever
   * way the project closes («Back», the route error boundary, a switch to another project), this
   * cleanup releases the reference, and the last reference flushes before it lets go.
   */
  const openKey = editorTarget?.projectId;
  const openFolder = editorTarget?.folderName;
  useEffect(() => {
    if (!openKey || !openFolder) return;
    const session = acquireProjectSession(openKey, openFolder);
    return () => {
      void session.close();
    };
  }, [openKey, openFolder]);

  /**
   * Load the grid's model whenever the screen is shown, or after a capture/import wrote a
   * sheet. A read failure is an honest `error` state — never a silently empty grid.
   */
  useEffect(() => {
    if (route.name !== 'project' || !editorTarget) return;
    // D137: the shell owns the open-project registry. Re-registering is idempotent and makes the
    // grid's reads independent of whatever an unmounting editor did.
    registerOpenProject(editorTarget.projectId, editorTarget.folderName);
    // §11.9: the 14-day prune runs on project open. Deliberately non-fatal — a failed prune
    // must never hide the sheets — and it is the ONLY thing that ever removes a trash entry.
    void pruneTrash(editorTarget.projectId).catch(() => undefined);
    let alive = true;
    void (async () => {
      try {
        const dir = await resolveOpenProjectDir(editorTarget.projectId);
        const file = await readProjectFile(dir);
        const cards = await listProjectSheets(editorTarget.projectId);
        if (!alive) return;
        setProjectTitle(file.project.title);
        setProjectSheets(cards);
        setProjectLoad(cards.length === 0 ? 'empty' : 'ready');
        void loadTrash(editorTarget.projectId);
      } catch {
        if (alive) setProjectLoad('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [route.name, editorTarget, projectRefresh]);

  /**
   * Home «New project»: create an app-named subfolder of the projects root, then land on
   * the **Project screen** with the capture overlay (the camera) already open — the owner's
   * D102 flow, «New project» → shutter → photo. Cancelling the capture leaves the grid's
   * copy-approved empty state («No sheets yet — take a photo to start.») with its two add
   * tiles, which is where a capture launched from the grid returns to as well (UI §11.8).
   *
   * A failure (root not open, quota, a locked target) surfaces as a toast — never silence.
   */
  async function handleNewProject(name: string): Promise<void> {
    if (creatingProject.current) return;
    creatingProject.current = true;
    setNewProjectBusy(true);
    try {
      const created = await createProject({ title: name });
      setNewProjectOpen(false);
      // D51: register under the full runtime key, exactly as the editor's load path does.
      const projectId = `${created.id}:${created.folderName}`;
      registerOpenProject(projectId, created.folderName);
      setSelectedSheetIds([]);
      setProjectLoad('loading');
      setCaptureOpen(true);
      dispatch({ type: 'openProject', project: { projectId, folderName: created.folderName } });
    } catch {
      // Slice 1.10: the failure is no longer invisible (D103's owed half). There is exactly
      // ONE `ToastHost`, mounted at the shell root (App's return), so every route — Home,
      // Settings, the sheets grid and the editor — renders what this emits (D114/F1 removed
      // the per-route hosts). The wording is the already-staged `errors.projectUnavailable`
      // copy — the project folder could not be created, and nothing is invented for a cause
      // we cannot name.
      emitToast({ text: STRINGS.errors.projectUnavailable, urgent: true });
    } finally {
      creatingProject.current = false;
      setNewProjectBusy(false);
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      let root: FileSystemDirectoryHandle | undefined;
      try {
        root = await getProjectsRoot();
      } catch {
        // No IndexedDB / storage denied → treat as first run rather than crash.
        root = undefined;
      }
      if (alive) dispatch({ type: 'booted', hasRoot: Boolean(root) });
      // The export session reads the default export location from the store synchronously,
      // so it must be hydrated at boot, not only when Settings is opened.
      try {
        const exportLocation = await getExportLocation();
        if (alive) useAppStore.getState().setExportLocation(exportLocation);
      } catch {
        // Keep the default ('dated'); a storage failure must not block boot.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const renderRoute = () => {
    if (route.name === 'loading') {
      return <main className="app-boot" aria-busy="true" />;
    }

    if (route.name === 'first-run') {
      return <FirstRun onDone={() => dispatch({ type: 'firstRunDone' })} />;
    }

    if (route.name === 'settings') {
      return <Settings onBack={() => dispatch({ type: 'goHome' })} />;
    }

    if (route.name === 'project') {
      const editorTarget = route.project;
      return (
        <ProjectScreen
          projectTitle={projectTitle || editorTarget.folderName}
          sheetCount={projectSheets.length}
          state={projectLoad}
          sheets={projectSheets}
          selectedIds={selectedSheetIds}
          onToggleSelected={(id) =>
            setSelectedSheetIds((ids) =>
              ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
            )
          }
          onClearSelection={() => setSelectedSheetIds([])}
          onOpenSheet={(id) => {
            setCaptureOpen(false);
            dispatch({ type: 'openSheet', sheetId: id });
          }}
          onTakePhoto={() => {
            requestFolderAccess();
            setCaptureOpen(true);
          }}
          onImport={() => {
            // Import is the editor's path — one write path, already covered there. The grid
            // hands off and the editor arms its picker; returning to the grid afterwards is
            // owed (recorded in D111).
            dispatch({ type: 'openImport' });
          }}
          onExport={(ids) => {
            // Export lives in the editor's wizard, which owns the destination and every write.
            // The selection is handed over so the wizard opens ALREADY scoped to it (it derives
            // `'selected'` from `selectedSheetIds`, UI §12:712).
            //
            // Review F4: the grid calls this with `[]` to mean "every sheet", so an empty list
            // must NOT be dropped — that navigated the user into an editor with no wizard at
            // all. It is expanded here, where the live sheet list is known.
            const scope = ids.length > 0 ? ids : projectSheets.map((card) => card.id);
            if (scope.length === 0) return; // nothing to export — stay on the grid
            setSelectedSheetIds(scope);
            setPendingExportSelection(scope);
            dispatch({ type: 'openExport' });
          }}
          onDeleteSheet={handleDeleteSheet}
          trash={trashItems}
          trashRestoreFailed={trashRestoreFailed}
          onOpenTrash={() => {
            void loadTrash(editorTarget.projectId);
          }}
          onRestoreSheet={handleRestoreSheet}
          onCloseTrash={() => setTrashRestoreFailed(false)}
          // D111's remaining items: the chip's real measurement, and the card actions whose
          // writes live at the shell (the storage layer is `src/fs/sheetOps.ts`).
          projectId={editorTarget.projectId}
          refreshKey={projectRefresh}
          onReorderSheets={handleReorderSheets}
          onRenameSheet={handleRenameSheet}
          onDuplicateSheet={handleDuplicateSheet}
          onReplacePhoto={handleReplacePhoto}
          replacePrompt={replacePrompt}
          onResolveReplace={(choice) => {
            void handleResolveReplace(choice);
          }}
          onRetry={() => {
            // D142: the error state's recovery. Re-register (idempotent) and reload the grid.
            registerOpenProject(editorTarget.projectId, editorTarget.folderName);
            setProjectRefresh((n) => n + 1);
          }}
          onBack={() => {
            setSelectedSheetIds([]);
            // D137: leaving the project is the one place its registration ends.
            clearOpenProject(editorTarget.projectId);
            dispatch({ type: 'goHome' });
          }}
        />
      );
    }

    if (route.name === 'editor') {
      const editorTarget = route.project;
      return (
        <Suspense fallback={<main className="app-boot" aria-busy="true" />}>
          <EditorLayout
            projectId={editorTarget.projectId}
            folderName={editorTarget.folderName}
            sheetId={route.sheetId}
            autoImport={route.intent === 'import'}
            initialExportSelection={pendingExportSelection ?? undefined}
            onInitialExportConsumed={() => setPendingExportSelection(null)}
            onAddSheet={() => {
              requestFolderAccess();
              setCaptureOpen(true);
            }}
            onExit={() => {
              // The editor's `‹ Projects` returns to the sheet grid it belongs to.
              setCaptureOpen(false);
              setProjectRefresh((n) => n + 1);
              dispatch({ type: 'exitEditor' });
            }}
          />
        </Suspense>
      );
    }

    return (
      <>
        <ProjectList
          loadCover={readProjectCover}
          onOpenSettings={() => dispatch({ type: 'openSettings' })}
          onOpenProject={(id, folderName) => {
            // D51: key on id + folderName. A scan entry with no valid id (unreadable
            // folder) is not openable; ProjectList still renders it with a Locate action.
            if (!id || !folderName) return;
            openProject(id, folderName);
          }}
          onNewProject={() => setNewProjectOpen(true)}
          onOpenFolder={() => {
            /* slice 1.2 — reveals/opens an existing project folder */
          }}
        />
        {/* §13.4: the single-instance toast surface is mounted ONCE at the shell root (below),
            so every route — Home, Settings, the sheets grid and the editor — can actually show
            what the code emits. Before this, the project route had no host at all: a delete
            emitted «Sheet deleted · Undo» into the void (review F1). */}
      </>
    );
  };

  return (
    <>
      {/* D138: a render crash in one route shows a recoverable fallback instead of unmounting the
          whole app to a blank page. `key={route}` gives every navigation a fresh boundary. */}
      <AppErrorBoundary
        variant="route"
        key={route.name}
        onReset={() => {
          setCaptureOpen(false);
          dispatch({ type: 'goHome' });
        }}
      >
        {renderRoute()}
      </AppErrorBoundary>
      {/* §11.2:720's replace picker. Mounted at the shell root with the other app-level
          overlays: the grid hands the id over and gets a warned dialog if the dimensions
          differ — the picker itself is not a grid control. */}
      <input
        ref={replaceInputRef}
        className="editor-file-input"
        type="file"
        accept="image/*"
        aria-label={STRINGS.sheetMenu.replacePhoto}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onReplacePhotoPicked(file);
        }}
      />
      {/* Slice 1.11: the update prompt is mounted once at the shell root, so it survives
          route changes and is reachable from Home, the editor and first run alike. It
          renders nothing until a worker is waiting, and suppresses itself mid-measurement. */}
      <PWAUpdate />
      {/* UI/GUI handoff pass (2026-09-22): the VANGARDE watermark, mounted once so it is
          consistent across every route. Renders nothing when Settings › Display ›
          Watermark is off. */}
      <WatermarkOverlay />
      {/* D135: asks for the project's name before anything is created. */}
      {newProjectOpen ? (
        <NewProjectDialog
          busy={newProjectBusy}
          onCancel={() => setNewProjectOpen(false)}
          onCreate={(name) => void handleNewProject(name)}
        />
      ) : null}
      {/* §13.4: exactly ONE toast host for the whole app, mounted here rather than per route.
          A route that renders none (the sheets grid) silently swallowed every toast. */}
      <ToastHost />
      {/* Slice 1.4/1.10: the capture flow is a full-bleed overlay, mounted at the shell root
          so it works over the grid as well as the editor. It writes through the same
          `addSheetFromPhoto` path either way, and «Use photo» opens the new sheet (D148). */}
      {captureOpen && editorTarget ? (
        <AppErrorBoundary variant="route" onReset={() => setCaptureOpen(false)}>
          <Suspense fallback={null}>
            <CameraFlow
              projectId={editorTarget.projectId}
              folderName={editorTarget.folderName}
              onCaptured={(sheet) => {
                setCaptureOpen(false);
                // D148 (owner request): «Use photo» opens the new sheet for markup from either
                // origin. From the grid that is an editor route change; in the editor it is a sheet
                // switch. The grid refreshes so the card is there on the way back.
                setProjectRefresh((n) => n + 1);
                dispatch({ type: 'openSheet', sheetId: sheet.id });
              }}
              onCancel={() => setCaptureOpen(false)}
            />
          </Suspense>
        </AppErrorBoundary>
      ) : null}
    </>
  );
}
