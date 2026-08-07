import { describe, expect, it } from 'vitest';
import {
  getRegistrableDomain,
  hostnameOf,
  normalizeCookieDomain,
} from '../src/core/domain';

describe('normalizeCookieDomain', () => {
  it('strips the leading dot of domain cookies', () => {
    expect(normalizeCookieDomain('.example.com')).toBe('example.com');
  });

  it('leaves host-only cookie domains untouched', () => {
    expect(normalizeCookieDomain('example.com')).toBe('example.com');
  });
});

describe('getRegistrableDomain', () => {
  it('collapses subdomains to the registrable domain', () => {
    expect(getRegistrableDomain('mail.google.com')).toBe('google.com');
  });

  it('handles multi-label public suffixes', () => {
    expect(getRegistrableDomain('www.example.co.uk')).toBe('example.co.uk');
  });

  it('falls back to the hostname for IP addresses', () => {
    expect(getRegistrableDomain('192.168.1.10')).toBe('192.168.1.10');
  });

  it('falls back to the hostname for localhost', () => {
    expect(getRegistrableDomain('localhost')).toBe('localhost');
  });
});

describe('hostnameOf', () => {
  it('extracts the hostname of a URL', () => {
    expect(hostnameOf('https://mail.google.com/inbox')).toBe('mail.google.com');
  });

  it('returns undefined for unparsable input', () => {
    expect(hostnameOf('not a url')).toBeUndefined();
  });
});
