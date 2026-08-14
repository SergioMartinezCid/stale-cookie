import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  parseSettingsImport,
  serializeSettings,
  type Settings,
} from '../src/core/settings';

const custom: Settings = {
  ...DEFAULT_SETTINGS,
  cookieThresholdDays: 30,
  clearDownloads: true,
  autoCleanEnabled: true,
  autoCleanDays: 14,
  whitelist: ['bank.com', 'google.com'],
};

describe('settings import/export', () => {
  it('round-trips through serialize and parse', () => {
    expect(parseSettingsImport(serializeSettings(custom))).toEqual(custom);
  });

  it('rejects files that are not a settings export', () => {
    expect(parseSettingsImport('not json')).toBeUndefined();
    expect(parseSettingsImport('[1, 2]')).toBeUndefined();
    expect(parseSettingsImport('{"settings": {}}')).toBeUndefined(); // no version
    expect(parseSettingsImport('{"version": 99, "settings": {}}')).toBeUndefined();
    expect(parseSettingsImport('{"version": 1}')).toBeUndefined(); // no settings
    expect(parseSettingsImport('{"version": 1, "settings": null}')).toBeUndefined();
  });

  it('falls back to defaults for missing or invalid fields', () => {
    const parsed = parseSettingsImport(
      JSON.stringify({
        version: 1,
        settings: {
          cookieThresholdDays: -5, // out of range
          historyThresholdDays: '30', // wrong type
          reminderDays: 4000, // above the UI maximum
          clearHistory: 'yes', // wrong type
          keepNeverVisited: true, // valid — must survive
        },
      }),
    );
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, keepNeverVisited: true });
  });

  it('accepts a valid theme and rejects anything else', () => {
    const parse = (theme: unknown) =>
      parseSettingsImport(JSON.stringify({ version: 1, settings: { theme } }));
    expect(parse('light')?.theme).toBe('light');
    expect(parse('dark')?.theme).toBe('dark');
    expect(parse('system')?.theme).toBe(DEFAULT_SETTINGS.theme); // unknown value
    expect(parse(true)?.theme).toBe(DEFAULT_SETTINGS.theme); // wrong type
  });

  it('ignores unknown fields instead of importing them', () => {
    const parsed = parseSettingsImport(
      JSON.stringify({ version: 1, settings: { telemetry: true, autoCleanDays: 3 } }),
    );
    expect(parsed).toEqual({ ...DEFAULT_SETTINGS, autoCleanDays: 3 });
  });

  it('re-normalizes, dedupes and sorts whitelist entries', () => {
    const parsed = parseSettingsImport(
      JSON.stringify({
        version: 1,
        settings: {
          whitelist: ['https://Mail.Google.com/inbox', '.google.com', 42, 'bank.com', ''],
        },
      }),
    );
    expect(parsed?.whitelist).toEqual(['bank.com', 'google.com']);
  });

  it('imports an empty whitelist without inheriting defaults by reference', () => {
    const parsed = parseSettingsImport(JSON.stringify({ version: 1, settings: {} }));
    expect(parsed?.whitelist).toEqual([]);
    expect(parsed?.whitelist).not.toBe(DEFAULT_SETTINGS.whitelist);
  });
});
