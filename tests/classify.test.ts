import { describe, expect, it } from 'vitest';
import { classifyGroups, selectForAutoClean, shouldPreselectUnknown } from '../src/core/classify';
import { groupCookies, type ScannableCookie } from '../src/core/grouping';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function cookie(domain: string, overrides: Partial<ScannableCookie> = {}): ScannableCookie {
  return { name: 'sid', domain, path: '/', secure: true, storeId: 'firefox-default', ...overrides };
}

describe('classifyGroups', () => {
  const options = { now: NOW, thresholdMs: 30 * DAY_MS, whitelist: ['bank.com'] };

  it('classifies fresh, stale and unknown by last visit of the visit domain', () => {
    const groups = groupCookies([cookie('fresh.com'), cookie('old.com'), cookie('never.com')]);
    const lastVisit = new Map([
      ['fresh.com', NOW - 1 * DAY_MS],
      ['old.com', NOW - 90 * DAY_MS],
    ]);
    const verdicts = Object.fromEntries(
      classifyGroups(groups, lastVisit, options).map((g) => [g.registrableDomain, g.verdict]),
    );
    expect(verdicts).toEqual({ 'fresh.com': 'fresh', 'old.com': 'stale', 'never.com': 'unknown' });
  });

  it('whitelists by registrable domain regardless of staleness, case-insensitively', () => {
    const groups = groupCookies([cookie('.Bank.com')]);
    const [result] = classifyGroups(groups, new Map(), options);
    expect(result?.verdict).toBe('whitelisted');
  });

  it('protects partitioned cookies when their partition site is whitelisted', () => {
    const groups = groupCookies([
      cookie('.tracker.com', { partitionKey: { topLevelSite: 'https://bank.com' } }),
    ]);
    const [result] = classifyGroups(groups, new Map(), options);
    expect(result?.verdict).toBe('whitelisted');
  });

  it('judges partitioned cookies by the partition top-level site visits', () => {
    const groups = groupCookies([
      cookie('.tracker.com', { partitionKey: { topLevelSite: 'https://news.site.com' } }),
    ]);
    const lastVisit = new Map([['site.com', NOW - 1 * DAY_MS]]);
    const [result] = classifyGroups(groups, lastVisit, options);
    expect(result?.verdict).toBe('fresh');
  });
});

describe('shouldPreselectUnknown', () => {
  const mixed = () =>
    classifyGroups(
      groupCookies([cookie('visited.com'), cookie('never.com')]),
      new Map([['visited.com', NOW - 1 * DAY_MS]]),
      { now: NOW, thresholdMs: 30 * DAY_MS, whitelist: [] },
    );

  const allUnknown = () =>
    classifyGroups(groupCookies([cookie('a.com'), cookie('b.com')]), new Map(), {
      now: NOW,
      thresholdMs: 30 * DAY_MS,
      whitelist: [],
    });

  it('preselects never-visited sites when other sites do have visits', () => {
    expect(shouldPreselectUnknown(mixed(), false)).toBe(true);
  });

  it('does not preselect anything when no site has any recorded visit', () => {
    expect(shouldPreselectUnknown(allUnknown(), false)).toBe(false);
  });

  it('never preselects when the keep-never-visited setting is on', () => {
    expect(shouldPreselectUnknown(mixed(), true)).toBe(false);
  });
});

describe('selectForAutoClean', () => {
  const options = { now: NOW, thresholdMs: 30 * DAY_MS, whitelist: ['bank.com'] };

  const classified = () =>
    classifyGroups(
      groupCookies([
        cookie('fresh.com'),
        cookie('old.com'),
        cookie('never.com'),
        cookie('bank.com'),
      ]),
      new Map([
        ['fresh.com', NOW - 1 * DAY_MS],
        ['old.com', NOW - 90 * DAY_MS],
      ]),
      options,
    );

  it('selects stale and (mixed scan) never-visited groups, never fresh or whitelisted', () => {
    const domains = selectForAutoClean(classified(), false).map((g) => g.registrableDomain);
    expect(domains.sort()).toEqual(['never.com', 'old.com']);
  });

  it('leaves never-visited groups alone when the keep setting is on', () => {
    const domains = selectForAutoClean(classified(), true).map((g) => g.registrableDomain);
    expect(domains).toEqual(['old.com']);
  });

  it('selects nothing from a scan with no visit data at all', () => {
    const allUnknown = classifyGroups(
      groupCookies([cookie('a.com'), cookie('b.com')]),
      new Map(),
      { now: NOW, thresholdMs: 30 * DAY_MS, whitelist: [] },
    );
    expect(selectForAutoClean(allUnknown, false)).toEqual([]);
  });
});
