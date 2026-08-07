import { describe, expect, it } from 'vitest';
import {
  classifyLastVisit,
  normalizeCookieDomain,
} from '../src/core/staleness';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe('classifyLastVisit', () => {
  it('returns fresh when the last visit is within the threshold', () => {
    expect(classifyLastVisit(NOW - 10 * DAY_MS, NOW, 30 * DAY_MS)).toBe('fresh');
  });

  it('returns stale when the last visit is older than the threshold', () => {
    expect(classifyLastVisit(NOW - 31 * DAY_MS, NOW, 30 * DAY_MS)).toBe('stale');
  });

  it('returns fresh exactly at the threshold boundary', () => {
    expect(classifyLastVisit(NOW - 30 * DAY_MS, NOW, 30 * DAY_MS)).toBe('fresh');
  });

  it('returns unknown when there is no recorded visit', () => {
    expect(classifyLastVisit(undefined, NOW, 30 * DAY_MS)).toBe('unknown');
  });
});

describe('normalizeCookieDomain', () => {
  it('strips the leading dot of domain cookies', () => {
    expect(normalizeCookieDomain('.example.com')).toBe('example.com');
  });

  it('leaves host-only cookie domains untouched', () => {
    expect(normalizeCookieDomain('example.com')).toBe('example.com');
  });
});
