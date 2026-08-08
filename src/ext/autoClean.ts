import browser from 'webextension-polyfill';
import { selectForAutoClean } from '../core/classify';
import { scan, deleteGroups } from './scanner';
import { loadSettings, type Settings } from './settings';
import { resetReminderTimer } from './reminder';

/**
 * Scheduled/automatic cleaning. Runs in the background: an exact alarm fires
 * at base + interval (base = when auto-clean was enabled or the last run),
 * scans, and deletes what a manual preview would have pre-checked — stale
 * groups plus never-visited groups under the preselection policy. The
 * whitelist protects as always. There is no preview; the action log records
 * what was deleted.
 */
const ALARM_NAME = 'stale-cookie-auto-clean';
const BASE_KEY = 'autoCleanBase';

const DAY_MS = 24 * 60 * 60 * 1000;

async function getAutoCleanBase(): Promise<number> {
  const stored = await browser.storage.local.get(BASE_KEY);
  const base = stored[BASE_KEY] as number | undefined;
  if (base !== undefined) return base;
  // First scheduling: the cycle starts now — never clean right on enable.
  const now = Date.now();
  await browser.storage.local.set({ [BASE_KEY]: now });
  return now;
}

/** Recompute the alarm from current settings; runs immediately if overdue. */
export async function scheduleAutoClean(settings?: Settings): Promise<void> {
  const active = settings ?? (await loadSettings());
  await browser.alarms.clear(ALARM_NAME);
  if (!active.autoCleanEnabled) {
    // Drop the base so re-enabling starts a fresh cycle instead of finding
    // an ancient base and cleaning immediately.
    await browser.storage.local.remove(BASE_KEY);
    return;
  }
  const base = await getAutoCleanBase();
  const due = base + active.autoCleanDays * DAY_MS;
  if (Date.now() >= due) {
    // Overdue (e.g. the browser was closed past the due time) — run now.
    await runAutoClean(active);
  } else {
    browser.alarms.create(ALARM_NAME, { when: due });
  }
}

export async function handleAutoCleanAlarm(name: string): Promise<void> {
  if (name !== ALARM_NAME) return;
  const settings = await loadSettings();
  if (settings.autoCleanEnabled) {
    await runAutoClean(settings);
  }
}

async function runAutoClean(settings: Settings): Promise<void> {
  const outcome = await scan(settings);
  await deleteGroups(selectForAutoClean(outcome.groups, settings.keepNeverVisited));
  await browser.storage.local.set({ [BASE_KEY]: Date.now() });
  // An automatic clean is still a clean: keep the manual reminder's base in
  // step so switching back to manual mode counts from the last run.
  await resetReminderTimer();
  browser.alarms.create(ALARM_NAME, { when: Date.now() + settings.autoCleanDays * DAY_MS });
}
