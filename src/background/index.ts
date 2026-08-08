import browser from 'webextension-polyfill';
import { scheduleReminder, handleAlarm } from '../ext/reminder';
import { scheduleAutoClean, handleAutoCleanAlarm } from '../ext/autoClean';
import { installErrorCapture } from '../ext/errorLog';

installErrorCapture('background');

browser.runtime.onInstalled.addListener(() => {
  void scheduleReminder();
  void scheduleAutoClean();
});

// Alarms do not survive a browser restart — reschedule both on startup.
// An overdue auto-clean runs right here.
browser.runtime.onStartup.addListener(() => {
  void scheduleReminder();
  void scheduleAutoClean();
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
