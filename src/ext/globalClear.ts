import browser from 'webextension-polyfill';
import { appendActionLog } from './actionLog';

/**
 * Global clear for data types that cannot be scoped to a hostname
 * (Firefox's browsingData cannot scope cache or form data). By decision,
 * these are cleared ALL-or-nothing, invoked directly without a scan — the
 * caller's UI must show an explicit confirmation step, since this bypasses
 * the preview safety mechanism.
 */
export interface GlobalClearSelection {
  cache: boolean;
  formData: boolean;
}

/** Must be called from a user-input handler (permission doorhanger). */
export async function requestBrowsingDataPermission(): Promise<boolean> {
  return browser.permissions.request({ permissions: ['browsingData'] });
}

export async function runGlobalClear(selection: GlobalClearSelection): Promise<string[]> {
  const cleared: string[] = [];
  if (selection.cache) {
    await browser.browsingData.removeCache({});
    cleared.push('cache');
  }
  if (selection.formData) {
    await browser.browsingData.removeFormData({});
    cleared.push('formData');
  }
  if (cleared.length > 0) {
    await appendActionLog({ at: Date.now(), type: 'global-clear', dataTypes: cleared });
  }
  return cleared;
}
