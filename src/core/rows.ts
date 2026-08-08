import type { ClassifiedGroup } from './classify';

export type RowVerdict = 'stale' | 'unknown' | 'fresh';

/**
 * One preview row per site: every data type (cookies across all containers
 * and partitions, history, downloads) of the same visit domain shares the
 * row, so a site's data is deleted together. Partitioned cookies land in
 * the row of the partition top-level site — the site whose visits govern
 * them. Whitelisted groups never enter a row.
 */
export interface SiteRow {
  /** eTLD+1 the row represents (the members' visit domain). */
  domain: string;
  /** Members deleted when the row is selected: the stale and never-visited ones. */
  deletable: ClassifiedGroup[];
  /** Members left untouched (fresh by their own type's threshold). */
  freshCount: number;
  /** stale if any member is stale; unknown if the rest are never-visited; else fresh. */
  verdict: RowVerdict;
  lastVisitTime?: number;
}

export function buildSiteRows(groups: readonly ClassifiedGroup[]): SiteRow[] {
  const map = new Map<string, SiteRow>();
  for (const group of groups) {
    if (group.verdict === 'whitelisted') continue;
    let row = map.get(group.visitDomain);
    if (!row) {
      row = { domain: group.visitDomain, deletable: [], freshCount: 0, verdict: 'fresh' };
      map.set(group.visitDomain, row);
    }
    if (group.lastVisitTime !== undefined) {
      row.lastVisitTime = Math.max(row.lastVisitTime ?? 0, group.lastVisitTime);
    }
    if (group.verdict === 'fresh') {
      row.freshCount++;
      continue;
    }
    row.deletable.push(group);
    if (group.verdict === 'stale') {
      row.verdict = 'stale';
    } else if (row.verdict === 'fresh') {
      row.verdict = 'unknown';
    }
  }
  return [...map.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}
