export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "dark";

/**
 * Apply the theme to the document root by toggling the `dark` class.
 * Tailwind v4 dark variant is configured as `&:is(.dark *)` in globals.css,
 * so a single class on <html> flips the whole UI.
 */
export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}
