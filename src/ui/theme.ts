import type { Theme } from '../core/settings';

/**
 * Force the page's color scheme from the theme setting. Every color token
 * in theme.css is a light-dark() pair, so overriding color-scheme at the
 * root re-resolves all of them — no per-theme stylesheets. theme.css
 * declares `color-scheme: dark` as the pre-JS state to match the default
 * setting (no flash for the default case).
 */
export function applyTheme(theme: Theme): void {
  document.documentElement.style.colorScheme = theme;
}
