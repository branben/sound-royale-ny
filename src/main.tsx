import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { UserProvider } from "@/context/UserContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <UserProvider>
    <App />
  </UserProvider>
);
// self-hosted runner verification
