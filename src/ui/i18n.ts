import browser from 'webextension-polyfill';

/**
 * Message with a count baked in: uses the `<key>One` variant when n is 1.
 * i18n.getMessage has no plural rules, and "1 items" / "Se eliminaron 1
 * elementos" is broken grammar in the primary flow. The One-variants
 * hardcode the 1 (extra substitutions are ignored), which also lets
 * Spanish adjust the verb, not just the noun.
 */
export function msgCount(key: string, n: number): string {
  return browser.i18n.getMessage(n === 1 ? `${key}One` : key, [String(n)]);
}

/**
 * Fill every element carrying a `data-i18n` attribute with the localized
 * message of that name. All user-facing strings go through this (or
 * i18n.getMessage directly) — never hardcode them.
 */
export function localizePage(): void {
  // BCP 47 form for the lang attribute (the API reports e.g. "es_ES").
  document.documentElement.lang = browser.i18n.getMessage('@@ui_locale').replaceAll('_', '-');
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset['i18n'];
    if (key) element.textContent = browser.i18n.getMessage(key);
  }
}
