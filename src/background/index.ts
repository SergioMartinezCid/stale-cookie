import browser from 'webextension-polyfill';
import { scheduleReminder, handleAlarm, resetReminderTimer } from '../ext/reminder';
import { scheduleAutoClean, handleAutoCleanAlarm } from '../ext/autoClean';
import { deleteGroups, type DeleteGroupsRequest } from '../ext/scanner';
import { installErrorCapture } from '../ext/errorLog';
import { pruneStoredActionLog } from '../ext/actionLog';

installErrorCapture('background');

// Manual deletion runs here on the popup's behalf (see DeleteGroupsRequest:
// the popup can die mid-run). Returning a promise sends the async reply.
browser.runtime.onMessage.addListener((message: unknown) => {
  const request = message as DeleteGroupsRequest;
  if (request?.type !== 'delete-groups') return undefined;
  return (async () => {
    const removed = await deleteGroups(request.groups, 'background');
    // Cleaning starts a new reminder cycle — reset here so it happens even
    // if the asking popup is already gone. A delete that removed nothing
    // is no clean and leaves the cycle alone.
    if (removed > 0) await resetReminderTimer();
    return { removed };
  })();
});

browser.runtime.onInstalled.addListener(() => {
  void scheduleReminder();
  void scheduleAutoClean();
});

// Alarms do not survive a browser restart — reschedule both on startup.
// An overdue auto-clean runs right here. Startup also prunes action-log
// entries past the 30-day age bound (appends alone would let an idle
// profile keep them indefinitely).
browser.runtime.onStartup.addListener(() => {
  void scheduleReminder();
  void scheduleAutoClean();
  void pruneStoredActionLog();
});

browser.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm.name);
  void handleAutoCleanAlarm(alarm.name);
});

// Reminder settings may change from the options page; the popup resets the
// base itself via resetReminderTimer, which already reschedules.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['settings']) {
    void scheduleReminder();
    void scheduleAutoClean();
  }
});
