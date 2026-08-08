import { describe, expect, it } from 'vitest';
import { buildSiteRows } from '../src/core/rows';
import type { ClassifiedGroup } from '../src/core/classify';

function cookieGroup(overrides: Partial<ClassifiedGroup> = {}): ClassifiedGroup {
  return {
    kind: 'cookies',
    key: 'firefox-default|||example.com',
    registrableDomain: 'example.com',
    visitDomain: 'example.com',
    storeId: 'firefox-default',
    cookies: [{ name: 'sid', domain: 'example.com', path: '/', secure: true, storeId: 'firefox-default' }],
    verdict: 'stale',
    ...overrides,
  } as ClassifiedGroup;
}

function historyGroup(overrides: Partial<ClassifiedGroup> = {}): ClassifiedGroup {
  return {
    kind: 'history',
    key: 'history|example.com',
    registrableDomain: 'example.com',
    visitDomain: 'example.com',
    urls: ['https://example.com/'],
    lastVisitTime: 100,
    verdict: 'stale',
    ...overrides,
  } as ClassifiedGroup;
}

describe('buildSiteRows', () => {
  it('merges all data types of a site into one row', () => {
    const rows = buildSiteRows([
      cookieGroup({ lastVisitTime: 100 }),
      cookieGroup({ key: 'c2', storeId: 'firefox-container-1', lastVisitTime: 100 }),
      historyGroup({ lastVisitTime: 150 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.domain).toBe('example.com');
    expect(rows[0]?.deletable).toHaveLength(3);
    expect(rows[0]?.verdict).toBe('stale');
    expect(rows[0]?.lastVisitTime).toBe(150);
  });

  it('puts partitioned cookies in the partition site row', () => {
    const rows = buildSiteRows([
      cookieGroup({
        registrableDomain: 'tracker.com',
        visitDomain: 'news.com',
        partitionSite: 'https://news.com',
      } as Partial<ClassifiedGroup>),
      historyGroup({ registrableDomain: 'news.com', visitDomain: 'news.com', key: 'history|news.com' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.domain).toBe('news.com');
    expect(rows[0]?.deletable).toHaveLength(2);
  });

  it('keeps fresh members out of the deletable set without hiding the row verdict', () => {
    const rows = buildSiteRows([
      cookieGroup({ verdict: 'stale', lastVisitTime: 100 }),
      historyGroup({ verdict: 'fresh', lastVisitTime: 100 }),
    ]);
    expect(rows[0]?.verdict).toBe('stale');
    expect(rows[0]?.deletable).toHaveLength(1);
    expect(rows[0]?.freshCount).toBe(1);
  });

  it('marks a row unknown only when nothing in it is stale', () => {
    const rows = buildSiteRows([cookieGroup({ verdict: 'unknown', lastVisitTime: undefined })]);
    expect(rows[0]?.verdict).toBe('unknown');
  });

  it('excludes whitelisted groups and all-fresh rows stay fresh', () => {
    const rows = buildSiteRows([
      cookieGroup({ verdict: 'whitelisted' }),
      historyGroup({ registrableDomain: 'other.org', visitDomain: 'other.org', verdict: 'fresh' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.domain).toBe('other.org');
    expect(rows[0]?.verdict).toBe('fresh');
    expect(rows[0]?.deletable).toHaveLength(0);
  });

  it('sorts rows by domain', () => {
    const rows = buildSiteRows([
      historyGroup({ registrableDomain: 'zeta.com', visitDomain: 'zeta.com', key: 'history|zeta.com' }),
      historyGroup({ registrableDomain: 'alpha.com', visitDomain: 'alpha.com', key: 'history|alpha.com' }),
    ]);
    expect(rows.map((r) => r.domain)).toEqual(['alpha.com', 'zeta.com']);
  });
});
