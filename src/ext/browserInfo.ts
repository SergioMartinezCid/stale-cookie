import browser from 'webextension-polyfill';

/**
 * True when running in Firefox. The extension-page URL scheme is the one
 * signal that is synchronous, needs no permission, and cannot be spoofed:
 * moz-extension:// on Firefox, chrome-extension:// on Chromium.
 */
export function isFirefox(): boolean {
  return browser.runtime.getURL('').startsWith('moz-extension:');
}
