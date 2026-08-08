import { describe, expect, it } from 'vitest';
import {
  groupCookies,
  groupDownloads,
  groupHistory,
  type ScannableCookie,
} from '../src/core/grouping';

function cookie(overrides: Partial<ScannableCookie>): ScannableCookie {
  return {
    name: 'sid',
    domain: 'example.com',
    path: '/',
    secure: true,
    storeId: 'firefox-default',
    ...overrides,
  };
}

describe('groupCookies', () => {
  it('groups subdomain cookies under the registrable domain', () => {
    const groups = groupCookies([
      cookie({ domain: '.example.com' }),
      cookie({ domain: 'shop.example.com', name: 'cart' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.registrableDomain).toBe('example.com');
    expect(groups[0]?.cookies).toHaveLength(2);
  });

  it('keeps the same domain in different containers as separate groups', () => {
    const groups = groupCookies([
      cookie({}),
      cookie({ storeId: 'firefox-container-1' }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.storeId))).toEqual(
      new Set(['firefox-default', 'firefox-container-1']),
    );
  });

  it('separates partitioned cookies and judges them by the partition top-level site', () => {
    const groups = groupCookies([
      cookie({ domain: '.tracker.com' }),
      cookie({
        domain: '.tracker.com',
        partitionKey: { topLevelSite: 'https://news.example.co.uk' },
      }),
    ]);
    expect(groups).toHaveLength(2);
    const partitioned = groups.find((g) => g.partitionSite);
    expect(partitioned?.registrableDomain).toBe('tracker.com');
    expect(partitioned?.visitDomain).toBe('example.co.uk');
    const unpartitioned = groups.find((g) => !g.partitionSite);
    expect(unpartitioned?.visitDomain).toBe('tracker.com');
  });
});

describe('groupHistory', () => {
  it('groups URLs by registrable domain and keeps the most recent visit', () => {
    const groups = groupHistory([
      { url: 'https://mail.example.com/inbox', lastVisitTime: 100 },
      { url: 'https://example.com/', lastVisitTime: 300 },
      { url: 'https://other.org/page', lastVisitTime: 200 },
    ]);
    expect(groups).toHaveLength(2);
    const example = groups.find((g) => g.registrableDomain === 'example.com');
    expect(example?.urls).toHaveLength(2);
    expect(example?.lastVisitTime).toBe(300);
    expect(example?.kind).toBe('history');
  });

  it('skips items without a URL or visit time', () => {
    const groups = groupHistory([
      { url: 'https://example.com/' },
      { lastVisitTime: 100 },
      { url: 'not a url', lastVisitTime: 100 },
    ]);
    expect(groups).toHaveLength(0);
  });
});

describe('groupDownloads', () => {
  it('groups downloads by the URL registrable domain with the latest start time', () => {
    const groups = groupDownloads([
      { id: 1, url: 'https://cdn.example.com/a.zip', startTime: '2026-01-02T00:00:00.000Z' },
      { id: 2, url: 'https://example.com/b.pdf', startTime: '2026-03-04T00:00:00.000Z' },
      { id: 3, url: 'https://other.org/c.iso' },
    ]);
    expect(groups).toHaveLength(2);
    const example = groups.find((g) => g.registrableDomain === 'example.com');
    expect(example?.downloadIds).toEqual([1, 2]);
    expect(example?.latestTime).toBe(Date.parse('2026-03-04T00:00:00.000Z'));
    const other = groups.find((g) => g.registrableDomain === 'other.org');
    expect(other?.latestTime).toBeUndefined();
  });
});
