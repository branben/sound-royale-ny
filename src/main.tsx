import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { UserProvider } from "@/context/UserContext";
import "./index.css";

// Global error handlers — capture errors that would otherwise be silently lost
window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  console.error("[GlobalError] Unhandled promise rejection:", event.reason);
});

window.onerror = (
  message: string | Event,
  source?: string,
  lineno?: number,
  colno?: number,
  error?: Error
): boolean => {
  console.error("[GlobalError] Unhandled error:", {
    message,
    source,
    lineno,
    colno,
    stack: error?.stack,
  });
  return false; // Let the browser handle it too (error logging, etc.)
};

window.addEventListener(
  "error",
  (event: ErrorEvent) => {
    // Only log resource/XMLHttpRequest errors that slip through onerror
    if (event.target && event.target !== window) {
      console.error("[GlobalError] Resource error:", {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    }
  },
  true // Capture phase to catch resource errors
);

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>
);

