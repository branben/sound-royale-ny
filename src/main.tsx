import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { UserProvider } from '@/context/UserContext';
import './index.css';

// Sentry error monitoring — only initializes when VITE_SENTRY_DSN is set
import * as Sentry from '@sentry/react';
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? 'development',
    tracesSampleRate: import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ? Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) : 0.1,
    sendDefaultPii: false,
  });
}

// Global error handlers — capture errors that would otherwise be silently lost
window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  console.error('[GlobalError] Unhandled promise rejection:', event.reason);
});

window.onerror = (
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error,
): boolean => {
  console.error('[GlobalError] Unhandled error:', {
    message,
    source,
    lineno,
    colno,
    stack: error?.stack,
  });
  return false; // Let the browser handle it too (error logging, etc.)
};

window.addEventListener(
  'error',
  (event: ErrorEvent) => {
    // Only log resource/XMLHttpRequest errors that slip through onerror
    if (event.target && event.target !== window) {
      console.error('[GlobalError] Resource error:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    }
  },
  true, // Capture phase to catch resource errors
);

createRoot(document.getElementById('root')!).render(
  <UserProvider>
    <App />
  </UserProvider>,
);
