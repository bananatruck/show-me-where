export type Theme = "light" | "dark";

const KEY = "show-me-where.theme";

/** The saved choice, else the system preference. */
export function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage can be blocked; fall through to the system preference.
  }
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme, save: boolean): void {
  document.documentElement.dataset.theme = theme;
  if (!save) return;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // The choice then lasts only for this page.
  }
}

/** The highlighter colour for each theme; kept in step with --highlight in styles.css. */
export const HIGHLIGHT: Record<Theme, string> = { light: "#ffe45c", dark: "#7a6512" };
