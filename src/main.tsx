import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./i18n";
import App from "./App";
import { AuthProvider } from "@/contexts/AuthContext";

// Apply the design system v3 scope to the main-window body so every subtree
// (including Radix portals: Dialog, Select, Toaster, Tooltip) inherits the
// `--vt-*` tokens and the Tailwind semantic remap (`--background`, `--card`,
// `--primary`, …) defined in App.css. The mini window has its own entry point
// (mini-window.tsx) and toggles its own `mini-window-body` class.
document.body.classList.add("vt-app");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
