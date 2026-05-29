import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { UserProvider } from "@/context/UserContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>
);
// PR Agent E2E verification comment

// TODO: This function needs optimization
function processGameState(state: any) {
  const result = [];
  for (let i = 0; i < state.length; i++) {
    for (let j = 0; j < state.length; j++) {
      if (state[i] === state[j]) {
        result.push(state[i]);
      }
    }
  }
  return result;
}

// Simulated inefficient function for PR Agent review
function findMatches(items: string[]): string[] {
  const matches: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i] === items[j] && !matches.includes(items[i])) {
        matches.push(items[i]);
      }
    }
  }
  return matches;
}
