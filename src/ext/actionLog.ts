import browser from 'webextension-polyfill';
import type { ActionLogEntry } from '../core/logs';

export type { ActionLogEntry } from '../core/logs';

const MAX_ENTRIES = 200;

export async function appendActionLog(entry: ActionLogEntry): Promise<void> {
  const log = await getActionLog();
  log.push(entry);
  await browser.storage.local.set({ actionLog: log.slice(-MAX_ENTRIES) });
}

export async function getActionLog(): Promise<ActionLogEntry[]> {
  const stored = await browser.storage.local.get('actionLog');
  return (stored['actionLog'] as ActionLogEntry[] | undefined) ?? [];
}
