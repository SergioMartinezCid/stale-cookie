import { describe, expect, it } from 'vitest';
import { isReminderDue, reminderDueTime, shouldNotify } from '../src/core/reminder';

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE = 1_800_000_000_000;

describe('reminder timing', () => {
  it('becomes due exactly at base + interval', () => {
    expect(reminderDueTime(BASE, 30)).toBe(BASE + 30 * DAY_MS);
    expect(isReminderDue(BASE, 30, BASE + 30 * DAY_MS - 1)).toBe(false);
    expect(isReminderDue(BASE, 30, BASE + 30 * DAY_MS)).toBe(true);
  });
});

describe('shouldNotify', () => {
  it('notifies when never notified before', () => {
    expect(shouldNotify(BASE, undefined)).toBe(true);
  });

  it('does not notify twice within the same cycle', () => {
    expect(shouldNotify(BASE, BASE + 1000)).toBe(false);
  });

  it('notifies again after the timer was reset', () => {
    const notifiedLastCycle = BASE - 5 * DAY_MS;
    expect(shouldNotify(BASE, notifiedLastCycle)).toBe(true);
  });
});
