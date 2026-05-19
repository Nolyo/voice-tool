// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { OnboardingProgress } from "./OnboardingProgress";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("OnboardingProgress", () => {
  it("renders 3 dots when total is 3", () => {
    render(<OnboardingProgress current={1} total={3} />);
    expect(screen.getAllByRole("button").length).toBe(3);
  });

  it("marks current step with aria-current=step", () => {
    render(<OnboardingProgress current={2} total={3} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[1]).toHaveAttribute("aria-current", "step");
  });

  it("disables future steps", () => {
    render(<OnboardingProgress current={2} total={3} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[2]).toBeDisabled();
  });

  it("enables clicking on past steps when handler is provided", () => {
    const onStepClick = vi.fn();
    render(
      <OnboardingProgress current={3} total={3} onStepClick={onStepClick} />,
    );
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(onStepClick).toHaveBeenCalledWith(1);
  });

  it("does not allow clicking past steps when no handler is provided", () => {
    render(<OnboardingProgress current={3} total={3} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toBeDisabled();
  });
});
