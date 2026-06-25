// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const syncState = { enabled: true };
const sharesApi = {
  activeShareFor: vi.fn(() => undefined as undefined | { id: string; slug: string }),
  share: vi.fn(),
  revoke: vi.fn(),
};
vi.mock("@/hooks/useSync", () => ({ useSync: () => syncState }));
vi.mock("@/hooks/useNoteShares", () => ({ useNoteShares: () => sharesApi }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }) }));

import { ShareNoteButton } from "./ShareNoteButton";

const note = { id: "n1", title: "Tuto", createdAt: "", updatedAt: "", favorite: false, order: 0 };

beforeEach(() => {
  syncState.enabled = true;
  sharesApi.activeShareFor.mockReset().mockReturnValue(undefined);
  sharesApi.share.mockReset().mockResolvedValue({ id: "s1", slug: "aB3dEf9hKmNp2qrS" });
  sharesApi.revoke.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

describe("ShareNoteButton", () => {
  it("shows sync-required message when sync is off", () => {
    syncState.enabled = false;
    render(<ShareNoteButton note={note as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Share|Partager/i }));
    expect(screen.getByText(/Enable sync|synchronisation/i)).toBeInTheDocument();
  });

  it("creates a link when sync is on and no active share", async () => {
    render(<ShareNoteButton note={note as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Share|Partager/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create a public link|Créer/i }));
    await waitFor(() => expect(sharesApi.share).toHaveBeenCalledWith("n1", "Tuto"));
  });

  it("shows copy + stop when an active share exists", () => {
    sharesApi.activeShareFor.mockReturnValue({ id: "s1", slug: "aB3dEf9hKmNp2qrS" });
    render(<ShareNoteButton note={note as never} />);
    fireEvent.click(screen.getByRole("button", { name: /Share|Partager/i }));
    expect(screen.getByRole("button", { name: /Copy link|Copier/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stop sharing|Arrêter/i })).toBeInTheDocument();
  });
});
