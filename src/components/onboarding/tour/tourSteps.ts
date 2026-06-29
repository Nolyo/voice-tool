export interface TourStep {
  /** `data-tour` anchor id, or null for a centered anchorless step. */
  anchor: string | null;
  titleKey: string;
  bodyKey: string;
  /** Preferred bubble placement relative to the spotlight. */
  placement: "center" | "right" | "bottom" | "top";
}

export const TOUR_STEPS: TourStep[] = [
  { anchor: null, titleKey: "tour.welcome.title", bodyKey: "tour.welcome.body", placement: "center" },
  { anchor: "hero-dictation", titleKey: "tour.dictate.title", bodyKey: "tour.dictate.body", placement: "bottom" },
  { anchor: "nav-historique", titleKey: "tour.history.title", bodyKey: "tour.history.body", placement: "right" },
  { anchor: "nav-notes", titleKey: "tour.notes.title", bodyKey: "tour.notes.body", placement: "right" },
  { anchor: "nav-parametres", titleKey: "tour.settings.title", bodyKey: "tour.settings.body", placement: "right" },
  { anchor: "profile-switcher", titleKey: "tour.account.title", bodyKey: "tour.account.body", placement: "top" },
];

/**
 * The tour shows once, on the Accueil tab, after a fresh wizard completion flips
 * `tour_pending`. Gating on `settingsLoaded` avoids a flash before state is known.
 */
export function shouldShowGuidedTour(
  settingsLoaded: boolean,
  tourPending: boolean,
  activeTab: string,
): boolean {
  return settingsLoaded && tourPending && activeTab === "accueil";
}
