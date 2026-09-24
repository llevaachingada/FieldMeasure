import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './ui/ErrorBoundary';
import { installGlobalErrorHandlers } from './ui/globalErrors';
import './styles.css';

/**
 * Slice 0.1 entry point — nothing domain-specific here.
 *
 * TODO(slice 0.3): `await checkOrigin()` (src/data/originGuard.ts) BEFORE the first
 * render, and route `'first-run'` / `'changed'` to the blocking
 * «This app moved to a new address» screen. The stub returns `'ok'` for now
 * (build spec §21.1 part 3; the blocking screen UI is a later slice).
 *
 * D138: a whole-app error boundary (any render crash or chunk-load failure was
 * otherwise a blank page — F3) plus a global `unhandledrejection` handler, both local
 * only (console + a toast, no telemetry).
 */
installGlobalErrorHandlers();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary variant="app">
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
