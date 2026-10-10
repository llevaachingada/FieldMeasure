import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './ui/ErrorBoundary';
import { installGlobalErrorHandlers } from './ui/globalErrors';
import './styles.css';

/**
 * Slice 0.1 entry point — nothing domain-specific here.
 *
 * A changed host shows first run again; the fix is to re-pick the same folder (D166).
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
