import browser from 'webextension-polyfill';

/**
 * Fill every element carrying a `data-i18n` attribute with the localized
 * message of that name. All user-facing strings go through this (or
 * i18n.getMessage directly) — never hardcode them.
 */
export function localizePage(): void {
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset['i18n'];
    if (key) element.textContent = browser.i18n.getMessage(key);
  }
}
