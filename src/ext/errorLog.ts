import browser from 'webextension-polyfill';
import type { ErrorContext, ErrorLogEntry } from '../core/logs';

/**
 * Session-scoped error log for bug reports. Lives in storage.session —
 * memory only, shared across popup/options/background, gone when the
 * browser closes. Deliberately never persisted (privacy stance: errors are
 * a diagnostic aid the user exports by hand, not a record we keep).
 */
const KEY = 'errorLog';
const MAX_ENTRIES = 50;
const MAX_TEXT = 2000;

export async function getErrorLog(): Promise<ErrorLogEntry[]> {
  try {
    const stored = await browser.storage.session.get(KEY);
    return (stored[KEY] as ErrorLogEntry[] | undefined) ?? [];
  } catch {
    return [];
  }
}

function describe(value: unknown): { message: string; stack?: string } {
  if (value instanceof Error) {
    return { message: value.message.slice(0, MAX_TEXT), stack: value.stack?.slice(0, MAX_TEXT) };
  }
  try {
    const message = typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value));
    return { message: message.slice(0, MAX_TEXT) };
  } catch {
    return { message: String(value).slice(0, MAX_TEXT) };
  }
}

/** Fire-and-forget: recording an error must never throw or reject itself. */
export function recordError(context: ErrorContext, value: unknown): void {
  try {
    const entry: ErrorLogEntry = { at: Date.now(), context, ...describe(value) };
    void getErrorLog()
      .then((log) => browser.storage.session.set({ [KEY]: [...log, entry].slice(-MAX_ENTRIES) }))
      .catch(() => undefined);
  } catch {
    // Logging failures are swallowed by design.
  }
}

/** Catch anything uncaught in this page's context (popup, options, background). */
export function installErrorCapture(context: ErrorContext): void {
  addEventListener('error', (event) => {
    recordError(context, event.error ?? event.message);
  });
  addEventListener('unhandledrejection', (event) => {
    recordError(context, event.reason);
  });
}
