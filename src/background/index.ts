import browser from 'webextension-polyfill';
import { scheduleReminder, handleAlarm } from '../ext/reminder';

browser.runtime.onInstalled.addListener(() => {
  void scheduleReminder();
});

browser.runtime.onStartup.addListener(() => {
  void scheduleReminder();
});

browser.alarms.onAlarm.addListener((alarm) => {
  void handleAlarm(alarm.name);
});

// Reminder settings may change from the options page; the popup resets the
// base itself via resetReminderTimer, which already reschedules.
browser.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['settings']) {
    void scheduleReminder();
  }
});
