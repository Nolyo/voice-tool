import { createContext, useContext, type ReactNode } from "react";
import type { NoteMeta } from "@/hooks/useNotes";

export interface NoteLinkContextValue {
  notes: NoteMeta[];
  existingNoteIds: Set<string>;
  activeNoteId: string | null;
  onOpenNote: (id: string) => void;
  onRequestRecreate: (attrs: { id: string; title: string }, onResolved: (newId: string) => void) => void;
}

const NoteLinkContext = createContext<NoteLinkContextValue | null>(null);

export function NoteLinkProvider({
  value,
  children,
}: {
  value: NoteLinkContextValue;
  children: ReactNode;
}) {
  return <NoteLinkContext.Provider value={value}>{children}</NoteLinkContext.Provider>;
}

export function useNoteLinkContext(): NoteLinkContextValue {
  const ctx = useContext(NoteLinkContext);
  if (!ctx) {
    throw new Error("useNoteLinkContext must be used within a NoteLinkProvider");
  }
  return ctx;
}
