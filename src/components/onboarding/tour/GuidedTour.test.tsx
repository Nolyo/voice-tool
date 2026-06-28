// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { GuidedTour } from "./GuidedTour";

// i18n returns the key verbatim so we can assert on keys, not copy.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

afterEach(() => cleanup());

describe("GuidedTour", () => {
  it("renders the centered welcome step first", () => {
    render(<GuidedTour onFinish={vi.fn()} />);
    expect(screen.getByText("tour.welcome.title")).toBeTruthy();
    expect(screen.getByText("1 / 6")).toBeTruthy();
  });

  it("calls onFinish when the skip link is clicked", () => {
    const onFinish = vi.fn();
    render(<GuidedTour onFinish={onFinish} />);
    fireEvent.click(screen.getByText("tour.skip"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
