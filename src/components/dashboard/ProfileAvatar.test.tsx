// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ProfileAvatar, getInitials } from "./ProfileAvatar";

afterEach(() => cleanup());

const DATA_URL = "data:image/png;base64,AAAA";

describe("getInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(getInitials("Jean Dupont")).toBe("JD");
  });

  it("uses a single uppercase letter for one-word names", () => {
    expect(getInitials("nolyo")).toBe("N");
  });
});

describe("ProfileAvatar", () => {
  it("renders the image when an avatar URL is provided", () => {
    const { container } = render(
      <ProfileAvatar avatarUrl={DATA_URL} name="Jean Dupont" className="w-7 h-7" />
    );
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", DATA_URL);
    expect(screen.queryByText("JD")).not.toBeInTheDocument();
  });

  it("falls back to initials without an avatar URL", () => {
    const { container } = render(
      <ProfileAvatar name="Jean Dupont" className="w-7 h-7" />
    );
    expect(container.querySelector("img")).not.toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
  });
});
