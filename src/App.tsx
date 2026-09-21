/**
 * App shell routing (implementation plan slice 0.3 step 6; slice 1.3 adds the editor).
 *
 *   first-run → Home → Settings
 *                    └→ Editor (a project's first sheet)
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
import { useEffect, useState } from 'react';
import FirstRun from '@/ui/FirstRun';
import ProjectList from '@/ui/ProjectList';
import Settings from '@/ui/Settings';
import SheetEditor from '@/ui/SheetEditor';
import { getProjectsRoot } from '@/settings/projectsRoot';

type Route = 'loading' | 'first-run' | 'home' | 'settings' | 'editor';

interface EditorTarget {
  /** D51 runtime key: `${id}:${folderName}`. */
  projectId: string;
  folderName: string;
}

export default function App() {
  const [route, setRoute] = useState<Route>('loading');
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);

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
      <SheetEditor
        projectId={editorTarget.projectId}
        folderName={editorTarget.folderName}
        onExit={() => {
          setEditorTarget(null);
          setRoute('home');
        }}
      />
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
        setRoute('editor');
      }}
      onNewProject={() => {
        /* slice 1.4 — capture flow */
      }}
      onOpenFolder={() => {
        /* slice 1.2 — reveals/opens an existing project folder */
      }}
    />
  );
}
