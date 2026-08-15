import browser from 'webextension-polyfill';
import { pruneActionLog, type ActionLogEntry } from '../core/logs';

export type { ActionLogEntry } from '../core/logs';

export async function appendActionLog(entry: ActionLogEntry): Promise<void> {
  const log = await getActionLog();
  log.push(entry);
  await browser.storage.local.set({ actionLog: pruneActionLog(log, Date.now()) });
}

/**
 * Appends are the usual prune point; this startup pass keeps an idle
 * profile (no cleans for a month) from holding entries past the age bound.
 */
export async function pruneStoredActionLog(): Promise<void> {
  const log = await getActionLog();
  const pruned = pruneActionLog(log, Date.now());
  if (pruned.length !== log.length) await browser.storage.local.set({ actionLog: pruned });
}

export async function getActionLog(): Promise<ActionLogEntry[]> {
  const stored = await browser.storage.local.get('actionLog');
  return (stored['actionLog'] as ActionLogEntry[] | undefined) ?? [];
}
