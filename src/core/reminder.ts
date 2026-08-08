const DAY_MS = 24 * 60 * 60 * 1000;

/** When the reminder becomes due: the last reset (clean or skip) plus the interval. */
export function reminderDueTime(baseMs: number, reminderDays: number): number {
  return baseMs + reminderDays * DAY_MS;
}

export function isReminderDue(baseMs: number, reminderDays: number, now: number): boolean {
  return now >= reminderDueTime(baseMs, reminderDays);
}

/**
 * The notification fires once per due cycle: only if it hasn't fired since
 * the timer was last reset (cleaning or skipping starts a new cycle).
 */
export function shouldNotify(baseMs: number, notifiedAtMs: number | undefined): boolean {
  return notifiedAtMs === undefined || notifiedAtMs < baseMs;
}
