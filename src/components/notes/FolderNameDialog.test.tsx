// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? k,
  }),
}));

import { FolderNameDialog } from "./FolderNameDialog";

afterEach(() => cleanup());

function renderDialog(
  props: Partial<ComponentProps<typeof FolderNameDialog>> = {}
) {
  const onSubmit = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <FolderNameDialog
      open
      mode="create"
      onOpenChange={onOpenChange}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onSubmit, onOpenChange };
}

const nameInput = () => screen.getByLabelText("notes.folders.namePrompt");
const customInput = () =>
  screen.getByLabelText("notes.folders.iconCustomPlaceholder");
const saveButton = () => screen.getByRole("button", { name: "common.save" });

describe("FolderNameDialog icon picker", () => {
  it("create: submits the name with a null icon by default", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Work" } });
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Work", null);
  });

  it("create: picking a grid emoji submits it", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Work" } });
    fireEvent.click(screen.getByText("🔥"));
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Work", "🔥");
  });

  it("free input keeps only the first grapheme", () => {
    const { onSubmit } = renderDialog();
    fireEvent.change(nameInput(), { target: { value: "Work" } });
    fireEvent.change(customInput(), { target: { value: "📌 x" } });
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Work", "📌");
  });

  it("rename: save is disabled when name and icon are unchanged", () => {
    renderDialog({ mode: "rename", initialValue: "Docs", initialIcon: "📁" });
    expect(saveButton()).toBeDisabled();
  });

  it("rename: changing only the icon enables save and submits it", () => {
    const { onSubmit } = renderDialog({
      mode: "rename",
      initialValue: "Docs",
      initialIcon: null,
    });
    fireEvent.click(screen.getByText("🎯"));
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Docs", "🎯");
  });

  it("the none button clears a picked emoji", () => {
    const { onSubmit } = renderDialog({
      mode: "rename",
      initialValue: "Docs",
      initialIcon: "🔥",
    });
    fireEvent.click(
      screen.getByRole("button", { name: "notes.folders.iconNone" })
    );
    fireEvent.click(saveButton());
    expect(onSubmit).toHaveBeenCalledWith("Docs", null);
  });
});
