import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import { startSync } from "@/sync/startSync";
import "@/styles/tokens.css";
import "@/styles/global.css";
import "@/styles/layout.css";
import "@/styles/window.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
const mount = createRoot(root);

// S2.5 throwaway: /?spike=lwc (dev only). Remove with src/dev/S25Spike.tsx.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get("spike") === "lwc") {
  void import("@/dev/S25Spike").then(({ S25Spike }) => mount.render(<S25Spike />));
} else {
  startSync();
  mount.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}