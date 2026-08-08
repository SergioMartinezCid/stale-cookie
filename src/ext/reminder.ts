import browser from 'webextension-polyfill';
import { isReminderDue, reminderDueTime, shouldNotify } from '../core/reminder';
import { loadSettings, type Settings } from './settings';

/**
 * Manual-mode cleaning reminder. The timer's base is the last reset —
 * install, last clean, or last "skip this reminder" — stored in
 * storage.local. An exact alarm fires at base + interval; when due, the
 * toolbar badge is set (default vehicle) and, if enabled and permitted, a
 * system notification fires once per cycle.
 */
const ALARM_NAME = 'stale-cookie-reminder';
const NOTIFICATION_ID = 'stale-cookie-reminder';
const BASE_KEY = 'reminderBase';
const NOTIFIED_KEY = 'reminderNotifiedAt';

function reminderActive(settings: Settings): boolean {
  return settings.reminderBadge || settings.reminderNotification;
}

async function getReminderBase(): Promise<number> {
  const stored = await browser.storage.local.get(BASE_KEY);
  const base = stored[BASE_KEY] as number | undefined;
  if (base !== undefined) return base;
  // First run: the cycle starts now.
  const now = Date.now();
  await browser.storage.local.set({ [BASE_KEY]: now });
  return now;
}

export async function reminderDue(settings: Settings): Promise<boolean> {
  if (!reminderActive(settings)) return false;
  return isReminderDue(await getReminderBase(), settings.reminderDays, Date.now());
}

/** Recompute the alarm and badge from current settings and base. */
export async function scheduleReminder(settings?: Settings): Promise<void> {
  const active = settings ?? (await loadSettings());
  await browser.alarms.clear(ALARM_NAME);
  await browser.action.setBadgeText({ text: '' });
  if (!reminderActive(active)) return;
  const base = await getReminderBase();
  const due = reminderDueTime(base, active.reminderDays);
  if (Date.now() >= due) {
    await showReminder(active, base);
  } else {
    browser.alarms.create(ALARM_NAME, { when: due });
  }
}

export async function handleAlarm(name: string): Promise<void> {
  if (name !== ALARM_NAME) return;
  const settings = await loadSettings();
  if (await reminderDue(settings)) {
    await showReminder(settings, await getReminderBase());
  }
}

async function showReminder(settings: Settings, base: number): Promise<void> {
  if (settings.reminderBadge) {
    await browser.action.setBadgeText({ text: '!' });
    await browser.action.setBadgeBackgroundColor({ color: '#d70022' });
  }
  if (settings.reminderNotification && (await hasNotificationsPermission())) {
    const stored = await browser.storage.local.get(NOTIFIED_KEY);
    if (shouldNotify(base, stored[NOTIFIED_KEY] as number | undefined)) {
      await browser.notifications.create(NOTIFICATION_ID, {
        type: 'basic',
        title: browser.i18n.getMessage('extensionName'),
        message: browser.i18n.getMessage('reminderNotificationMessage'),
      });
      await browser.storage.local.set({ [NOTIFIED_KEY]: Date.now() });
    }
  }
}

/** Start a new cycle: after a clean or an explicit "skip this reminder". */
export async function resetReminderTimer(): Promise<void> {
  await browser.storage.local.set({ [BASE_KEY]: Date.now() });
  await browser.notifications.clear(NOTIFICATION_ID).catch(() => undefined);
  await scheduleReminder();
}

async function hasNotificationsPermission(): Promise<boolean> {
  try {
    return await browser.permissions.contains({ permissions: ['notifications'] });
  } catch {
    return false;
  }
}
