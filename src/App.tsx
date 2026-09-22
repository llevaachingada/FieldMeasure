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
import { createProject } from '@/fs/projectStore';
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

type Route = 'loading' | 'first-run' | 'home' | 'settings' | 'editor';

interface EditorTarget {
  /** D51 runtime key: `${id}:${folderName}`. */
  projectId: string;
  folderName: string;
}

export default function App() {
  const [route, setRoute] = useState<Route>('loading');
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  /** Slice 1.4: the editor's «Add sheet» opens the capture flow over the editor. */
  const [captureOpen, setCaptureOpen] = useState(false);
  /** The sheet the editor should open — set to the sheet a capture just wrote. */
  const [editorSheetId, setEditorSheetId] = useState<string | undefined>(undefined);
  /**
   * «New project» runs an async folder create. The flag makes a double-tap a no-op
   * (two clicks before the first create resolves must not mint two projects); the
   * button itself stays enabled and no spinner/copy is added.
   */
  const creatingProject = useRef(false);

  /**
   * Home «New project»: create an app-named subfolder of the projects root, then open
   * its editor **with the capture overlay (the camera) already open**. The site flow is
   * «New project» → shutter → photo on canvas, so the create lands on the camera, not a
   * nearly-empty editor. Cancelling the capture leaves the user on the editor's
   * copy-approved empty state («No sheets yet — take a photo to start.», with the
   * «Take photo» + «Import» pair) through the existing `onCancel` path.
   *
   * A failure (root not open, quota, a locked target) is swallowed and the user STAYS
   * on Home: there is no error-surface copy in this slice — the toast/autosave layer
   * (slice 1.10) owns error surfacing (recorded as owed).
   */
  async function handleNewProject(): Promise<void> {
    if (creatingProject.current) return;
    creatingProject.current = true;
    try {
      const created = await createProject();
      setEditorTarget({
        projectId: `${created.id}:${created.folderName}`,
        folderName: created.folderName,
      });
      setEditorSheetId(undefined);
      setCaptureOpen(true);
      setRoute('editor');
    } catch {
      // Slice 1.10 owns error surfacing; stay on Home.
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

  if (route === 'loading') {
    return <main className="app-boot" aria-busy="true" />;
  }

  if (route === 'first-run') {
    return <FirstRun onDone={() => setRoute('home')} />;
  }

  if (route === 'settings') {
    return <Settings onBack={() => setRoute('home')} />;
  }

  if (route === 'editor' && editorTarget) {
    return (
      <>
        <Suspense fallback={<main className="app-boot" aria-busy="true" />}>
          <EditorLayout
            projectId={editorTarget.projectId}
            folderName={editorTarget.folderName}
            sheetId={editorSheetId}
            onAddSheet={() => setCaptureOpen(true)}
            onExit={() => {
              setCaptureOpen(false);
              setEditorSheetId(undefined);
              setEditorTarget(null);
              setRoute('home');
            }}
          />
        </Suspense>
        {/* Slice 1.4: the capture flow is a full-bleed overlay over the editor. It
            writes through the same `addSheetFromPhoto` path as the editor's import, and
            on accept the editor re-opens on the sheet that was just written. */}
        {captureOpen ? (
          <Suspense fallback={null}>
            <CameraFlow
              projectId={editorTarget.projectId}
              folderName={editorTarget.folderName}
              onCaptured={(sheet) => {
                setCaptureOpen(false);
                setEditorSheetId(sheet.id);
              }}
              onCancel={() => setCaptureOpen(false)}
            />
          </Suspense>
        ) : null}
      </>
    );
  }

  return (
    <ProjectList
      onOpenSettings={() => setRoute('settings')}
      onOpenProject={(id, folderName) => {
        // D51: key on id + folderName. A scan entry with no valid id (unreadable
        // folder) is not openable; ProjectList still renders it with a Locate action.
        if (!folderName || !id) return;
        setEditorTarget({ projectId: `${id}:${folderName}`, folderName });
        setEditorSheetId(undefined);
        setCaptureOpen(false);
        setRoute('editor');
      }}
      onNewProject={() => {
        void handleNewProject();
      }}
      onOpenFolder={() => {
        /* slice 1.2 — reveals/opens an existing project folder */
      }}
    />
  );
}
