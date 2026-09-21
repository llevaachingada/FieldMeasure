/**
 * App shell routing (implementation plan slice 0.3 step 6).
 *
 *   first-run → Home → Settings
 *
 * There is no router dependency (closed dep list §2.2): a tiny route state keeps
 * the shell honest until the real navigation lands. First run is considered done
 * once a projects-root handle has been persisted (`fm:projects-root`).
 *
 * `main.tsx` is intentionally untouched — origin-guard wiring is a later slice.
 */
import { useEffect, useState } from 'react';
import FirstRun from '@/ui/FirstRun';
import ProjectList from '@/ui/ProjectList';
import Settings from '@/ui/Settings';
import { getProjectsRoot } from '@/settings/projectsRoot';

type Route = 'loading' | 'first-run' | 'home' | 'settings';

export default function App() {
  const [route, setRoute] = useState<Route>('loading');

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

  return (
    <ProjectList
      onOpenSettings={() => setRoute('settings')}
      onOpenProject={() => {
        /* slice 1.2 — Project screen */
      }}
      onNewProject={() => {
        /* slice 1.2 — folder scan + project creation */
      }}
      onOpenFolder={() => {
        /* slice 1.2 — reveals/opens an existing project folder */
      }}
    />
  );
}
