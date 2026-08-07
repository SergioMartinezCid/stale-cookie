import { describe, expect, it } from 'vitest';
import { cookieRemovalDetails } from '../src/core/removal';
import type { ScannableCookie } from '../src/core/grouping';

function cookie(overrides: Partial<ScannableCookie>): ScannableCookie {
  return {
    name: 'sid',
    domain: '.example.com',
    path: '/app',
    secure: true,
    storeId: 'firefox-default',
    ...overrides,
  };
}

describe('cookieRemovalDetails', () => {
  it('reconstructs an https URL for Secure cookies and strips the domain dot', () => {
    expect(cookieRemovalDetails(cookie({}))).toEqual({
      url: 'https://example.com/app',
      name: 'sid',
      storeId: 'firefox-default',
    });
  });

  it('uses http for non-Secure cookies', () => {
    expect(cookieRemovalDetails(cookie({ secure: false })).url).toBe('http://example.com/app');
  });

  it('passes through firstPartyDomain and partitionKey when present', () => {
    const details = cookieRemovalDetails(
      cookie({
        firstPartyDomain: 'example.com',
        partitionKey: { topLevelSite: 'https://top.com' },
      }),
    );
    expect(details.firstPartyDomain).toBe('example.com');
    expect(details.partitionKey).toEqual({ topLevelSite: 'https://top.com' });
  });

  it('omits firstPartyDomain and partitionKey when absent', () => {
    const details = cookieRemovalDetails(cookie({}));
    expect('firstPartyDomain' in details).toBe(false);
    expect('partitionKey' in details).toBe(false);
  });
});
