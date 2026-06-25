// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const sharesApi = {
  shares: [] as Array<{ id: string; slug: string; noteId: string; titleSnapshot: string; createdAt: string }>,
  loading: false,
  revoke: vi.fn(),
};
vi.mock("@/hooks/useNoteShares", () => ({ useNoteShares: () => sharesApi }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }) }));

import { SharedLinksPanel } from "./SharedLinksPanel";

afterEach(cleanup);

beforeEach(() => {
  sharesApi.shares = [
    { id: "1", slug: "aB3dEf9hKmNp2qrS", noteId: "n1", titleSnapshot: "Tuto A", createdAt: "2026-06-25" },
  ];
  sharesApi.loading = false;
  sharesApi.revoke.mockReset().mockResolvedValue(undefined);
});

describe("SharedLinksPanel", () => {
  it("lists active shares with their title", () => {
    render(<SharedLinksPanel />);
    expect(screen.getByText("Tuto A")).toBeInTheDocument();
  });

  it("shows empty state when no shares", () => {
    sharesApi.shares = [];
    render(<SharedLinksPanel />);
    expect(screen.getByText(/No active links|Aucun lien/i)).toBeInTheDocument();
  });

  it("revokes a share on click", async () => {
    render(<SharedLinksPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Revoke|Révoquer/i }));
    await waitFor(() => expect(sharesApi.revoke).toHaveBeenCalledWith("1"));
  });
});
