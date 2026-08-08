import browser from 'webextension-polyfill';

/**
 * Local log of destructive actions the extension performed. Never leaves
 * the browser; exists so the user can audit what was deleted. Deliberately
 * records no visit timestamps — deleted history stays deleted.
 */
export type ActionLogEntry =
  | {
      at: number;
      type: 'delete-cookies';
      deleted: Array<{ domain: string; storeId: string; count: number }>;
    }
  | {
      at: number;
      type: 'delete-history' | 'delete-downloads';
      deleted: Array<{ domain: string; count: number }>;
    }
  | {
      at: number;
      type: 'global-clear';
      dataTypes: string[];
    };

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
