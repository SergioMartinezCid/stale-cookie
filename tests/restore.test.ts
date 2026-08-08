import { describe, expect, it } from 'vitest';
import { cookieRestoreDetails, type RestorableCookie } from '../src/core/restore';

const NOW = 1_754_600_000; // seconds — the cookies API unit

function cookie(overrides: Partial<RestorableCookie> = {}): RestorableCookie {
  return {
    name: 'sid',
    value: 'secret',
    domain: 'example.com',
    path: '/',
    secure: true,
    httpOnly: true,
    hostOnly: true,
    session: false,
    sameSite: 'lax',
    expirationDate: NOW + 3600,
    storeId: 'firefox-default',
    firstPartyDomain: '',
    ...overrides,
  };
}

describe('cookieRestoreDetails', () => {
  it('rebuilds a host-only secure cookie', () => {
    expect(cookieRestoreDetails(cookie(), NOW)).toEqual({
      url: 'https://example.com/',
      name: 'sid',
      value: 'secret',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      expirationDate: NOW + 3600,
      storeId: 'firefox-default',
      firstPartyDomain: '',
    });
  });

  it('uses http and keeps the domain attribute for a domain cookie', () => {
    const details = cookieRestoreDetails(
      cookie({ domain: '.example.com', hostOnly: false, secure: false }),
      NOW,
    );
    expect(details?.url).toBe('http://example.com/');
    expect(details?.domain).toBe('.example.com');
    expect(details?.secure).toBe(false);
  });

  it('infers host-only from the missing leading dot when the flag is absent', () => {
    const flagless = cookie();
    delete flagless.hostOnly;
    expect(cookieRestoreDetails(flagless, NOW)?.domain).toBeUndefined();

    const dotted = cookie({ domain: '.example.com' });
    delete dotted.hostOnly;
    expect(cookieRestoreDetails(dotted, NOW)?.domain).toBe('.example.com');
  });

  it('skips cookies that expired since the snapshot', () => {
    expect(cookieRestoreDetails(cookie({ expirationDate: NOW - 1 }), NOW)).toBeUndefined();
    expect(cookieRestoreDetails(cookie({ expirationDate: NOW }), NOW)).toBeUndefined();
  });

  it('restores session cookies without an expiration date', () => {
    const details = cookieRestoreDetails(
      cookie({ session: true, expirationDate: undefined }),
      NOW,
    );
    expect(details).toBeDefined();
    expect(details?.expirationDate).toBeUndefined();
  });

  it('treats a session-flagged cookie with a stale expirationDate as a session cookie', () => {
    // Defensive: session cookies should not carry expirationDate, but if one
    // does, the session flag wins and the cookie is still restorable.
    const details = cookieRestoreDetails(
      cookie({ session: true, expirationDate: NOW - 100 }),
      NOW,
    );
    expect(details).toBeDefined();
    expect(details?.expirationDate).toBeUndefined();
  });

  it('carries container store and partition through', () => {
    const details = cookieRestoreDetails(
      cookie({
        storeId: 'firefox-container-2',
        partitionKey: { topLevelSite: 'https://news.example.org' },
      }),
      NOW,
    );
    expect(details?.storeId).toBe('firefox-container-2');
    expect(details?.partitionKey).toEqual({ topLevelSite: 'https://news.example.org' });
  });

  it('defaults missing optional fields safely', () => {
    const bare: RestorableCookie = {
      name: 'a',
      domain: 'example.com',
      path: '/x',
      secure: false,
      storeId: 'firefox-default',
    };
    expect(cookieRestoreDetails(bare, NOW)).toEqual({
      url: 'http://example.com/x',
      name: 'a',
      value: '',
      path: '/x',
      secure: false,
      httpOnly: false,
      storeId: 'firefox-default',
    });
  });
});
