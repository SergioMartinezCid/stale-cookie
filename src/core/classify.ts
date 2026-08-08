import { classifyLastVisit } from './staleness';
import type { SiteGroup } from './grouping';

export type GroupVerdict = 'whitelisted' | 'fresh' | 'stale' | 'unknown';

/** What classification needs from a group — any kind of site data qualifies. */
export interface ClassifiableGroup {
  registrableDomain: string;
  visitDomain: string;
}

export type Classified<T extends ClassifiableGroup> = T & {
  verdict: GroupVerdict;
  lastVisitTime?: number;
};

/** A classified group of any data kind — what the scan produces. */
export type ClassifiedGroup = Classified<SiteGroup>;

export interface ClassifyOptions {
  /** Current time, milliseconds since epoch. */
  now: number;
  /** Staleness threshold in milliseconds. */
  thresholdMs: number;
  /** Protected registrable domains — never deleted. */
  whitelist: readonly string[];
}

/**
 * Attach a verdict to each group. The whitelist protects when either the
 * group's own registrable domain or its visit domain is whitelisted — so
 * protecting a site also covers the partitioned cookies living under it.
 * Staleness is judged by visitDomain (the partition top-level site for
 * partitioned cookies). Thresholds differ per data type — call once per kind.
 */
export function classifyGroups<T extends ClassifiableGroup>(
  groups: readonly T[],
  lastVisitByDomain: ReadonlyMap<string, number>,
  options: ClassifyOptions,
): Classified<T>[] {
  const whitelist = new Set(options.whitelist.map((d) => d.toLowerCase()));
  return groups.map((group) => {
    const lastVisitTime = lastVisitByDomain.get(group.visitDomain);
    if (
      whitelist.has(group.registrableDomain.toLowerCase()) ||
      whitelist.has(group.visitDomain.toLowerCase())
    ) {
      return { ...group, verdict: 'whitelisted' as const, lastVisitTime };
    }
    const verdict = classifyLastVisit(lastVisitTime, options.now, options.thresholdMs);
    return { ...group, verdict, lastVisitTime };
  });
}

/**
 * Whether never-visited groups should be preselected for deletion.
 * A scan where NOTHING has a recorded visit (fresh install, wiped history)
 * carries no signal, so nothing is preselected regardless of the setting.
 */
export function shouldPreselectUnknown(
  groups: ReadonlyArray<{ lastVisitTime?: number }>,
  keepNeverVisited: boolean,
): boolean {
  if (keepNeverVisited) return false;
  return groups.some((group) => group.lastVisitTime !== undefined);
}
