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
