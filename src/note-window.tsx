import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "./i18n";
import "./App.css";
import { DetachedNoteShell } from "@/components/note-window/DetachedNoteShell";

// Design-system scope (same as main.tsx) — the detached window is a normal
// opaque native window, so the opaque `.vt-app` background is correct here.
document.body.classList.add("vt-app");

const params = new URLSearchParams(window.location.search);
const noteId = params.get("noteId");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {noteId ? <DetachedNoteShell noteId={noteId} /> : null}
  </React.StrictMode>,
);
