import { classifyLastVisit } from './staleness';
import type { CookieGroup } from './grouping';

export type GroupVerdict = 'whitelisted' | 'fresh' | 'stale' | 'unknown';

export interface ClassifiedGroup extends CookieGroup {
  verdict: GroupVerdict;
  lastVisitTime?: number;
}

export interface ClassifyOptions {
  /** Current time, milliseconds since epoch. */
  now: number;
  /** Staleness threshold in milliseconds. */
  thresholdMs: number;
  /** Protected registrable domains — never deleted. */
  whitelist: readonly string[];
}

/**
 * Attach a verdict to each cookie group. The whitelist protects by the
 * group's own registrable domain (what the user sees and typed), while
 * staleness is judged by visitDomain (the partition top-level site for
 * partitioned cookies).
 */
export function classifyGroups(
  groups: readonly CookieGroup[],
  lastVisitByDomain: ReadonlyMap<string, number>,
  options: ClassifyOptions,
): ClassifiedGroup[] {
  const whitelist = new Set(options.whitelist.map((d) => d.toLowerCase()));
  return groups.map((group) => {
    const lastVisitTime = lastVisitByDomain.get(group.visitDomain);
    if (whitelist.has(group.registrableDomain.toLowerCase())) {
      return { ...group, verdict: 'whitelisted' as const, lastVisitTime };
    }
    const verdict = classifyLastVisit(lastVisitTime, options.now, options.thresholdMs);
    return { ...group, verdict, lastVisitTime };
  });
}
