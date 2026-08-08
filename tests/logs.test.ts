import { describe, expect, it } from 'vitest';
import {
  createAnonymizer,
  serializeLogs,
  type ActionLogEntry,
  type ErrorLogEntry,
} from '../src/core/logs';

describe('createAnonymizer', () => {
  it('maps the same site to the same alias, different sites to different ones', () => {
    const anon = createAnonymizer();
    expect(anon.site('example.com')).toBe('site-1.example');
    expect(anon.site('example.com')).toBe('site-1.example');
    expect(anon.site('other.net')).toBe('site-2.example');
  });

  it('folds subdomains into their registrable domain', () => {
    const anon = createAnonymizer();
    expect(anon.site('mail.google.com')).toBe(anon.site('google.com'));
    expect(anon.site('Mail.GOOGLE.com')).toBe(anon.site('google.com'));
  });

  it('replaces URLs in text, dropping paths and queries', () => {
    const anon = createAnonymizer();
    const scrubbed = anon.text(
      'Failed to remove cookie at https://mail.google.com/inbox?msg=secret-token',
    );
    expect(scrubbed).toBe('Failed to remove cookie at https://site-1.example/…');
  });

  it('replaces bare domain tokens but leaves non-domains alone', () => {
    const anon = createAnonymizer();
    expect(anon.text('cookie domain old-bank.example.com rejected')).toBe(
      'cookie domain site-1.example rejected',
    );
    expect(anon.text('at runScan (popup.js:42)')).toBe('at runScan (popup.js:42)');
    expect(anon.text('browser.storage.local failed')).toBe('browser.storage.local failed');
  });

  it('uses one shared alias for a site seen as URL, bare domain, and site()', () => {
    const anon = createAnonymizer();
    const scrubbed = anon.text('https://shop.example.org/cart then example.org again');
    expect(scrubbed).toBe('https://site-1.example/… then site-1.example again');
    expect(anon.site('example.org')).toBe('site-1.example');
  });

  it('redacts the extension-origin UUID but keeps the code path', () => {
    const anon = createAnonymizer();
    const stack =
      'runScan@moz-extension://c9c1d1e2-9f04-45f2-b432-a1b2c3d4e5f6/popup/popup.js:12:3';
    expect(anon.text(stack)).toBe('runScan@moz-extension://extension/popup/popup.js:12:3');
  });

  it('replaces IPv4 addresses', () => {
    const anon = createAnonymizer();
    expect(anon.text('request to 192.168.1.20 refused')).toBe('request to site-1.example refused');
  });

  it('never re-maps its own aliases', () => {
    const anon = createAnonymizer();
    const once = anon.text('visit evil.com now');
    expect(anon.text(once)).toBe(once);
  });
});

describe('serializeLogs', () => {
  const actions: ActionLogEntry[] = [
    {
      at: 1754600000000,
      type: 'delete-cookies',
      deleted: [
        { domain: 'stale-forum.com', storeId: 'firefox-default', count: 3 },
        { domain: 'old-bank.com', storeId: 'firefox-container-1', count: 1 },
      ],
    },
    { at: 1754600001000, type: 'global-clear', dataTypes: ['cache'] },
  ];
  const errors: ErrorLogEntry[] = [
    {
      at: 1754600002000,
      context: 'popup',
      message: 'cookies.remove failed for https://stale-forum.com/login',
      stack: 'deleteGroups@moz-extension://c9c1d1e2-9f04-45f2-b432-a1b2c3d4e5f6/popup/popup.js:1',
    },
  ];

  const parse = (jsonl: string) =>
    jsonl
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  it('emits a meta line followed by one tagged line per entry', () => {
    const lines = parse(
      serializeLogs({ actions, errors, version: '0.1.0', exportedAt: 1754600003000, anonymize: false }),
    );
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({
      kind: 'meta',
      extension: 'stale-cookie',
      version: '0.1.0',
      anonymized: false,
    });
    expect(lines.slice(1).map((l) => l['kind'])).toEqual(['action', 'action', 'error']);
    expect(lines[1]?.['at']).toBe(new Date(1754600000000).toISOString());
  });

  it('keeps real domains when anonymize is off', () => {
    const output = serializeLogs({
      actions,
      errors,
      version: '0.1.0',
      exportedAt: 0,
      anonymize: false,
    });
    expect(output).toContain('stale-forum.com');
    expect(output).toContain('https://stale-forum.com/login');
  });

  it('pseudonymizes consistently across action entries and error text', () => {
    const lines = parse(
      serializeLogs({ actions, errors, version: '0.1.0', exportedAt: 0, anonymize: true }),
    );
    const output = JSON.stringify(lines);
    expect(output).not.toContain('stale-forum.com');
    expect(output).not.toContain('old-bank.com');
    const cookieEntry = lines[1] as { deleted: Array<{ domain: string; count: number }> };
    // stale-forum.com appears in both an action entry and the error message —
    // one shared map means both get the same alias.
    const forumAlias = cookieEntry.deleted[0]?.domain;
    expect(forumAlias).toBe('site-1.example');
    expect(lines[3]?.['message']).toBe(`cookies.remove failed for https://${forumAlias}/…`);
    expect(cookieEntry.deleted[1]?.domain).toBe('site-2.example');
    // Container store ids and counts are not personal — they survive.
    expect(cookieEntry.deleted[1]).toMatchObject({ count: 1 });
  });

  it('scrubs the extension UUID from stacks when anonymizing', () => {
    const lines = parse(
      serializeLogs({ actions: [], errors, version: '0.1.0', exportedAt: 0, anonymize: true }),
    );
    expect(lines[1]?.['stack']).toBe(
      'deleteGroups@moz-extension://extension/popup/popup.js:1',
    );
  });

  it('leaves global-clear entries untouched by anonymization', () => {
    const lines = parse(
      serializeLogs({ actions, errors: [], version: '0.1.0', exportedAt: 0, anonymize: true }),
    );
    expect(lines[2]).toMatchObject({ kind: 'action', type: 'global-clear', dataTypes: ['cache'] });
  });
});
