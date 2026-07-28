import { describe, it, expect } from "vitest";
import { resolveChannel } from "./version-channel";

describe("resolveChannel", () => {
  it("reports a plain release as stable", () => {
    expect(resolveChannel("3.2.0")).toBe("stable");
  });

  it("reports every pre-release suffix we publish as beta", () => {
    // release.yml publishes -beta / -alpha / -rc / -test as GitHub
    // prereleases. The badge collapses all four into one "beta" label; the
    // full version number shown next to it carries the fine detail.
    expect(resolveChannel("3.2.0-beta.3")).toBe("beta");
    expect(resolveChannel("3.2.0-rc.1")).toBe("beta");
    expect(resolveChannel("3.2.0-alpha")).toBe("beta");
    expect(resolveChannel("3.2.0-test.1")).toBe("beta");
  });

  it("ignores SemVer build metadata", () => {
    // `+build.7` is not a pre-release: 3.2.0+build.7 IS the stable 3.2.0.
    // Stripping it first also protects against a dash inside the metadata.
    expect(resolveChannel("3.2.0+build.7")).toBe("stable");
    expect(resolveChannel("3.2.0+build-7")).toBe("stable");
    expect(resolveChannel("3.2.0-beta.3+build.7")).toBe("beta");
  });

  it("falls back to stable on empty or malformed input", () => {
    // Safe default: the badge sits next to the version number, so a wrong
    // guess is visible, and nothing in the app branches on the channel.
    expect(resolveChannel("")).toBe("stable");
    expect(resolveChannel("3.2.0-")).toBe("stable");
  });
});
