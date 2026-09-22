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
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import FirstRun from '@/ui/FirstRun';
import ProjectList from '@/ui/ProjectList';
import Settings from '@/ui/Settings';
import ToastHost from '@/ui/Toast';
import PWAUpdate from '@/ui/PWAUpdate';
import { useThemeRuntime } from '@/ui/themeRuntime';
import { emitToast } from '@/editor/session';
import ProjectScreen from '@/ui/ProjectScreen';
import { listProjectSheets, type ProjectSheetCard } from '@/fs/projectSheets';
import { createProject, readProjectFile, registerOpenProject, resolveOpenProjectDir } from '@/fs/projectStore';
import { deleteSheet, listTrash, pruneTrash, restoreSheet, type TrashedSheet } from '@/fs/sheetTrash';
import { STRINGS, t } from '@/ui/strings';
import { getProjectsRoot } from '@/settings/projectsRoot';

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

type Route = 'loading' | 'first-run' | 'home' | 'settings' | 'project' | 'editor';

interface EditorTarget {
  /** D51 runtime key: `${id}:${folderName}`. */
  projectId: string;
  folderName: string;
}

export default function App() {
  // Display theme (slice 1.10): applies `<html data-theme="…">` and hydrates the
  // persisted choice on boot. Runs for every route — chrome is themed app-wide.
  useThemeRuntime();

  const [route, setRoute] = useState<Route>('loading');
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  /** Slice 1.4: the editor's «Add sheet» opens the capture flow over the editor. */
  const [captureOpen, setCaptureOpen] = useState(false);
  /** The sheet the editor should open — set to the sheet a capture just wrote. */
  const [editorSheetId, setEditorSheetId] = useState<string | undefined>(undefined);
  /**
   * Slice 1.10: the Project screen (the sheets grid, UI §11.2) — its loaded model, its
   * state, and a refresh counter bumped after a capture/import writes a new sheet.
   */
  const [projectSheets, setProjectSheets] = useState<readonly ProjectSheetCard[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [projectLoad, setProjectLoad] = useState<'loading' | 'ready' | 'empty' | 'error'>('loading');
  const [projectRefresh, setProjectRefresh] = useState(0);
  /**
   * Which surface opened the capture overlay. §11.8: a capture launched from the grid
   * returns **to the grid**; one launched from the editor opens the sheet it wrote.
   */
  const [captureOrigin, setCaptureOrigin] = useState<'grid' | 'editor'>('editor');
  /** The grid's batch-export selection (empty = every sheet). */
  const [selectedSheetIds, setSelectedSheetIds] = useState<readonly string[]>([]);
  /** «Import» from the grid opens the editor with its file picker already armed. */
  const [importOnOpen, setImportOnOpen] = useState(false);
  /** Slice 1.10: the 14-day trash — the panel's list (`undefined` = not loaded yet) and the
   *  shell-reported restore failure the panel renders honestly. */
  const [trashItems, setTrashItems] = useState<readonly TrashedSheet[] | undefined>(undefined);
  const [trashRestoreFailed, setTrashRestoreFailed] = useState(false);
  /** A grid «Export» hand-off: the selection the wizard must open already scoped to. */
  const [pendingExportSelection, setPendingExportSelection] = useState<readonly string[] | null>(null);
  /**
   * «New project» runs an async folder create. The flag makes a double-tap a no-op
   * (two clicks before the first create resolves must not mint two projects); the
   * button itself stays enabled and no spinner/copy is added.
   */
  const creatingProject = useRef(false);

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
    // D51: the registry — and therefore every resolver — is keyed by the FULL runtime key.
    // Registering the bare id leaves `resolveOpenProjectDir` unable to find the folder.
    const projectId = `${id}:${folderName}`;
    registerOpenProject(projectId, folderName);
    setEditorTarget({ projectId, folderName });
    setEditorSheetId(undefined);
    setSelectedSheetIds([]);
    setImportOnOpen(false);
    setCaptureOpen(false);
    setProjectLoad('loading');
    setRoute('project');
  }

  /** Load (or refresh) the project's 14-day trash for the grid's panel. */
  async function loadTrash(projectId: string): Promise<void> {
    try {
      setTrashItems(await listTrash(projectId));
    } catch {
      // An unreadable trash must not take the grid down with it; an empty list is the honest
      // fallback because the panel distinguishes "not loaded" (`undefined`) from "empty".
      setTrashItems([]);
    }
  }

  /**
   * Delete a sheet into `.trash/` (UI §13.3 — recoverable, never a silent no-op). It RESOLVES
   * only once the write has landed: the screen announces «Sheet deleted · Undo» on success and
   * an honest failure line otherwise, so the toast can never claim a deletion that did not
   * happen (D113).
   */
  async function handleDeleteSheet(id: string): Promise<void> {
    if (!editorTarget) return;
    await deleteSheet(editorTarget.projectId, id);
    setSelectedSheetIds((ids) => ids.filter((x) => x !== id));
    setProjectRefresh((n) => n + 1);
    await loadTrash(editorTarget.projectId);
  }

  /** Restore a trashed sheet (§11.9). A failure is reported to the panel, never swallowed. */
  async function handleRestoreSheet(id: string): Promise<void> {
    if (!editorTarget) return;
    try {
      await restoreSheet(editorTarget.projectId, id);
      setTrashRestoreFailed(false);
      setProjectRefresh((n) => n + 1);
      await loadTrash(editorTarget.projectId);
    } catch {
      setTrashRestoreFailed(true);
      // Review F5: this catch used to be silent for the user — `trashRestoreFailed` surfaces
      // only inside the trash panel, which is CLOSED when the delete toast's Undo fires. A
      // failed restore must be visible wherever it was triggered.
      emitToast({ text: STRINGS.trash.restoreFailed, urgent: true });
    }
  }

  /**
   * Load the grid's model whenever the screen is shown, or after a capture/import wrote a
   * sheet. A read failure is an honest `error` state — never a silently empty grid.
   */
  useEffect(() => {
    if (route !== 'project' || !editorTarget) return;
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
  }, [route, editorTarget, projectRefresh]);

  /**
   * Home «New project»: create an app-named subfolder of the projects root, then land on
   * the **Project screen** with the capture overlay (the camera) already open — the owner's
   * D102 flow, «New project» → shutter → photo. Cancelling the capture leaves the grid's
   * copy-approved empty state («No sheets yet — take a photo to start.») with its two add
   * tiles, which is where a capture launched from the grid returns to as well (UI §11.8).
   *
   * A failure (root not open, quota, a locked target) surfaces as a toast — never silence.
   */
  async function handleNewProject(): Promise<void> {
    if (creatingProject.current) return;
    creatingProject.current = true;
    try {
      const created = await createProject();
      // D51: register under the full runtime key, exactly as the editor's load path does.
      const projectId = `${created.id}:${created.folderName}`;
      registerOpenProject(projectId, created.folderName);
      setEditorTarget({ projectId, folderName: created.folderName });
      setEditorSheetId(undefined);
      setSelectedSheetIds([]);
      setProjectLoad('loading');
      setCaptureOrigin('grid');
      setCaptureOpen(true);
      setRoute('project');
    } catch {
      // Slice 1.10: the failure is no longer invisible (D103's owed half). The toast
      // lives at the home route (the editor has its own `ToastHost`). The wording is the
      // already-staged `errors.projectUnavailable` copy — the project folder could not be
      // created, and nothing is invented for a cause we cannot name.
      emitToast({ text: STRINGS.errors.projectUnavailable, urgent: true });
    } finally {
      creatingProject.current = false;
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
      if (alive) setRoute(root ? 'home' : 'first-run');
    })();
    return () => {
      alive = false;
    };
  }, []);

  const renderRoute = () => {
    if (route === 'loading') {
      return <main className="app-boot" aria-busy="true" />;
    }

    if (route === 'first-run') {
      return <FirstRun onDone={() => setRoute('home')} />;
    }

    if (route === 'settings') {
      return <Settings onBack={() => setRoute('home')} />;
    }

    if (route === 'project' && editorTarget) {
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
            setEditorSheetId(id);
            setRoute('editor');
          }}
          onTakePhoto={() => {
            setCaptureOrigin('grid');
            setCaptureOpen(true);
          }}
          onImport={() => {
            // Import is the editor's path — one write path, already covered there. The grid
            // hands off and the editor arms its picker; returning to the grid afterwards is
            // owed (recorded in D111).
            setImportOnOpen(true);
            setRoute('editor');
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
            setRoute('editor');
          }}
          onDeleteSheet={handleDeleteSheet}
          trash={trashItems}
          trashRestoreFailed={trashRestoreFailed}
          onOpenTrash={() => {
            void loadTrash(editorTarget.projectId);
          }}
          onRestoreSheet={handleRestoreSheet}
          onCloseTrash={() => setTrashRestoreFailed(false)}
          onBack={() => {
            setSelectedSheetIds([]);
            setRoute('home');
          }}
        />
      );
    }

    if (route === 'editor' && editorTarget) {
      return (
        <Suspense fallback={<main className="app-boot" aria-busy="true" />}>
          <EditorLayout
            projectId={editorTarget.projectId}
            folderName={editorTarget.folderName}
            sheetId={editorSheetId}
            autoImport={importOnOpen}
            initialExportSelection={pendingExportSelection ?? undefined}
            onInitialExportConsumed={() => setPendingExportSelection(null)}
            onAddSheet={() => {
              setCaptureOrigin('editor');
              setCaptureOpen(true);
            }}
            onExit={() => {
              // The editor's `‹ Projects` returns to the sheet grid it belongs to.
              setCaptureOpen(false);
              setEditorSheetId(undefined);
              setImportOnOpen(false);
              setProjectRefresh((n) => n + 1);
              setRoute('project');
            }}
          />
        </Suspense>
      );
    }

    return (
      <>
        <ProjectList
          onOpenSettings={() => setRoute('settings')}
          onOpenProject={(id, folderName) => {
            // D51: key on id + folderName. A scan entry with no valid id (unreadable
            // folder) is not openable; ProjectList still renders it with a Locate action.
            if (!id || !folderName) return;
            openProject(id, folderName);
          }}
          onNewProject={() => {
            void handleNewProject();
          }}
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
      {renderRoute()}
      {/* Slice 1.11: the update prompt is mounted once at the shell root, so it survives
          route changes and is reachable from Home, the editor and first run alike. It
          renders nothing until a worker is waiting, and suppresses itself mid-measurement. */}
      <PWAUpdate />
      {/* §13.4: exactly ONE toast host for the whole app, mounted here rather than per route.
          A route that renders none (the sheets grid) silently swallowed every toast. */}
      <ToastHost />
      {/* Slice 1.4/1.10: the capture flow is a full-bleed overlay, mounted at the shell root
          so it works over the grid as well as the editor. It writes through the same
          `addSheetFromPhoto` path either way; `captureOrigin` decides where «Use photo»
          returns — §11.8 sends a grid-launched capture back to the grid, with the new sheet
          announced. */}
      {captureOpen && editorTarget ? (
        <Suspense fallback={null}>
          <CameraFlow
            projectId={editorTarget.projectId}
            folderName={editorTarget.folderName}
            onCaptured={(sheet) => {
              setCaptureOpen(false);
              if (captureOrigin === 'editor') {
                setEditorSheetId(sheet.id);
              } else {
                setProjectRefresh((n) => n + 1);
                // The «↶ Undo» half of §11.8's toast is owed: deleting a sheet has no path
                // yet (it is its own slice, with `.trash/`).
                emitToast(t(STRINGS.toasts.addedSheet, { sheetName: sheet.title }));
              }
            }}
            onCancel={() => setCaptureOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
