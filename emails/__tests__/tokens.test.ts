import { describe, it, expect } from "vitest";
import { colors, fontStack, logoUrl, spacing } from "../components/tokens";

describe("tokens", () => {
  it("exposes Lexena brand colors", () => {
    expect(colors.navy).toBe("#0D1B2A");
    expect(colors.signalGreen).toBe("#1D9E75");
    expect(colors.bg).toBe("#F6F6F7");
    expect(colors.card).toBe("#FFFFFF");
  });

  it("provides a font stack starting with Inter", () => {
    expect(fontStack).toMatch(/^Inter,/);
    expect(fontStack).toContain("-apple-system");
    expect(fontStack).toContain("Segoe UI");
  });

  it("exposes a stable logo URL", () => {
    expect(logoUrl).toMatch(/^https:\/\//);
    expect(logoUrl).toContain("monogram");
  });

  it("provides spacing scale", () => {
    expect(spacing.lg).toBe("32px");
    expect(spacing.xl).toBe("40px");
  });
});
