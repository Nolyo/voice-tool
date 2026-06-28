import { describe, it, expect } from "vitest";
import { TOUR_STEPS, shouldShowGuidedTour } from "./tourSteps";

describe("TOUR_STEPS", () => {
  it("starts with a centered, anchorless welcome step", () => {
    expect(TOUR_STEPS[0].anchor).toBeNull();
    expect(TOUR_STEPS[0].placement).toBe("center");
  });

  it("every step has tour.* title and body keys", () => {
    for (const s of TOUR_STEPS) {
      expect(s.titleKey).toMatch(/^tour\./);
      expect(s.bodyKey).toMatch(/^tour\./);
    }
  });

  it("includes the hero, sidebar and profile anchors", () => {
    const anchors = TOUR_STEPS.map((s) => s.anchor);
    expect(anchors).toContain("hero-dictation");
    expect(anchors).toContain("nav-historique");
    expect(anchors).toContain("nav-notes");
    expect(anchors).toContain("nav-parametres");
    expect(anchors).toContain("profile-switcher");
  });
});

describe("shouldShowGuidedTour", () => {
  it("is true only when loaded, pending, and on the accueil tab", () => {
    expect(shouldShowGuidedTour(true, true, "accueil")).toBe(true);
  });
  it("is false when settings not loaded", () => {
    expect(shouldShowGuidedTour(false, true, "accueil")).toBe(false);
  });
  it("is false when not pending", () => {
    expect(shouldShowGuidedTour(true, false, "accueil")).toBe(false);
  });
  it("is false on any other tab", () => {
    expect(shouldShowGuidedTour(true, true, "parametres")).toBe(false);
  });
});
