// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GuidedTour } from "./GuidedTour";

// i18n returns the key verbatim so we can assert on keys, not copy.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

afterEach(() => {
  cleanup();
  document.body.style.pointerEvents = "";
});

describe("GuidedTour", () => {
  it("renders the centered welcome step first", () => {
    render(<GuidedTour onFinish={vi.fn()} />);
    expect(screen.getByText("tour.welcome.title")).toBeTruthy();
    expect(screen.getByText("1 / 6")).toBeTruthy();
  });

  it("clears a stale body pointer-events lock on mount (regression)", () => {
    // Simulates a Radix dialog (onboarding wizard) that unmounted while open
    // and left the body frozen — which made the tour buttons unclickable.
    document.body.style.pointerEvents = "none";
    render(<GuidedTour onFinish={vi.fn()} />);
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("restores the body lock cleanup when unmounted", () => {
    document.body.style.pointerEvents = "none";
    const { unmount } = render(<GuidedTour onFinish={vi.fn()} />);
    document.body.style.pointerEvents = "none"; // re-poison while mounted
    unmount();
    expect(document.body.style.pointerEvents).toBe("");
  });

  it("removes a leaked onboarding overlay on mount (regression)", () => {
    // The onboarding Radix dialog, unmounted while still `open`, can leave its
    // full-screen dim veil orphaned in the DOM. The tour sits above it, so its
    // spotlight hole would reveal the veil instead of the highlighted card.
    const veil = document.createElement("div");
    veil.setAttribute("data-onboarding-overlay", "");
    document.body.appendChild(veil);

    render(<GuidedTour onFinish={vi.fn()} />);

    expect(document.querySelector("[data-onboarding-overlay]")).toBeNull();
  });

  it("calls onFinish when the skip link is clicked", () => {
    const onFinish = vi.fn();
    render(<GuidedTour onFinish={onFinish} />);
    fireEvent.click(screen.getByText("tour.skip"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
