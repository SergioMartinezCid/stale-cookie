import { describe, expect, it } from 'vitest';
import { groupCookies, type ScannableCookie } from '../src/core/grouping';

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
