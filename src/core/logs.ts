import { parse } from 'tldts';
import { getRegistrableDomain, hostnameOf } from './domain';

/**
 * True only for tokens whose suffix is a real public suffix (ICANN or
 * private registry) — "popup.js" or "cookies.remove" in a stack trace are
 * not domains even though they are shaped like one.
 */
function isRealDomain(token: string): boolean {
  const result = parse(token);
  return result.domain !== null && (result.isIcann === true || result.isPrivate === true);
}

/**
 * Local log of destructive actions the extension performed. Never leaves
 * the browser; exists so the user can audit what was deleted. Deliberately
 * records no visit timestamps — deleted history stays deleted.
 */
export type ActionLogEntry =
  | {
      at: number;
      type: 'delete-cookies';
      deleted: Array<{ domain: string; storeId: string; count: number }>;
    }
  | {
      at: number;
      type: 'delete-history' | 'delete-downloads';
      deleted: Array<{ domain: string; count: number }>;
    }
  | {
      at: number;
      type: 'global-clear';
      dataTypes: string[];
    }
  | {
      at: number;
      type: 'restore-cookies';
      restored: Array<{ domain: string; storeId: string; count: number }>;
    };

export type ErrorContext = 'popup' | 'options' | 'background';

/**
 * One captured runtime error. Session-scoped by design: kept in
 * storage.session (memory only), gone when the browser closes.
 */
export interface ErrorLogEntry {
  at: number;
  context: ErrorContext;
  message: string;
  stack?: string;
}

export interface Anonymizer {
  /** Consistent pseudonym for a hostname: same site → same alias. */
  site(host: string): string;
  /** Scrub URLs, domains and IPs out of free text (error messages, stacks). */
  text(text: string): string;
}

const URL_PATTERN = /(https?|wss?|ftps?):\/\/[^\s"'<>()[\]]+/gi;
// The extension-origin id identifies the browser profile (Firefox: a
// per-profile UUID; Chrome: 32 chars of a–p); the path after it is our own
// code and stays (useful in stack traces, not personal).
const EXTENSION_UUID_PATTERN =
  /(moz-extension|chrome-extension):\/\/(?:[0-9a-f-]{36}|[a-p]{32})/gi;
// The final label alternation covers punycode TLDs (xn--…, e.g. IDN
// registries), which contain digits/hyphens that [a-z]{2,} rejects.
const HOST_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:xn--[a-z0-9-]+|[a-z]{2,})\b/gi;
const IPV4_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/**
 * Pseudonymizes sites consistently within one export: every hostname folds to
 * its registrable domain and maps to "site-N.example", so recurring sites stay
 * correlated in the exported log without being identifiable. The mapping lives
 * only in memory for the duration of the export.
 */
export function createAnonymizer(): Anonymizer {
  const aliases = new Map<string, string>();

  const site = (host: string): string => {
    const key = getRegistrableDomain(host.toLowerCase());
    let alias = aliases.get(key);
    if (alias === undefined) {
      alias = `site-${aliases.size + 1}.example`;
      aliases.set(key, alias);
    }
    return alias;
  };

  const text = (input: string): string =>
    input
      .replace(EXTENSION_UUID_PATTERN, '$1://extension')
      .replace(URL_PATTERN, (url) => {
        const host = hostnameOf(url);
        // Paths and queries are the most sensitive part of a URL — drop them.
        return host === undefined ? '[url]' : `${url.slice(0, url.indexOf(':'))}://${site(host)}/…`;
      })
      .replace(HOST_PATTERN, (token) =>
        // ".example" is reserved (never a real domain), so aliases that this
        // pass already inserted are never re-mapped.
        isRealDomain(token.toLowerCase()) ? site(token) : token,
      )
      .replace(IPV4_PATTERN, (ip) => site(ip));

  return { site, text };
}

export interface LogExport {
  actions: readonly ActionLogEntry[];
  errors: readonly ErrorLogEntry[];
  /** Extension version, recorded so a bug report says what it came from. */
  version: string;
  exportedAt: number;
  anonymize: boolean;
}

function anonymizeAction(entry: ActionLogEntry, anonymizer: Anonymizer): ActionLogEntry {
  switch (entry.type) {
    case 'global-clear':
      return entry;
    case 'delete-cookies':
      return {
        ...entry,
        deleted: entry.deleted.map((d) => ({ ...d, domain: anonymizer.site(d.domain) })),
      };
    case 'delete-history':
    case 'delete-downloads':
      return {
        ...entry,
        deleted: entry.deleted.map((d) => ({ ...d, domain: anonymizer.site(d.domain) })),
      };
    case 'restore-cookies':
      return {
        ...entry,
        restored: entry.restored.map((r) => ({ ...r, domain: anonymizer.site(r.domain) })),
      };
  }
}

/**
 * JSONL export of both logs: a meta line, then one tagged line per entry.
 * With anonymize on, one shared pseudonym map covers action entries and error
 * text alike, so the same site correlates across both logs.
 */
export function serializeLogs({ actions, errors, version, exportedAt, anonymize }: LogExport): string {
  const anonymizer = createAnonymizer();
  const lines: unknown[] = [
    {
      kind: 'meta',
      extension: 'stale-cookie',
      version,
      exportedAt: new Date(exportedAt).toISOString(),
      anonymized: anonymize,
    },
  ];
  for (const entry of actions) {
    const { at, ...rest } = anonymize ? anonymizeAction(entry, anonymizer) : entry;
    lines.push({ kind: 'action', at: new Date(at).toISOString(), ...rest });
  }
  for (const entry of errors) {
    const { at, message, stack, ...rest } = entry;
    lines.push({
      kind: 'error',
      at: new Date(at).toISOString(),
      ...rest,
      message: anonymize ? anonymizer.text(message) : message,
      stack: stack === undefined ? undefined : anonymize ? anonymizer.text(stack) : stack,
    });
  }
  return lines.map((line) => JSON.stringify(line)).join('\n') + '\n';
}
