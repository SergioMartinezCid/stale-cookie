import browser from 'webextension-polyfill';
import { localizePage } from '../ui/i18n';
import { scanCookies, deleteCookieGroups, type ScanOutcome } from '../ext/scanner';
import { loadSettings, addToWhitelist } from '../ext/settings';
import type { ClassifiedGroup } from '../core/classify';

localizePage();

const msg = (key: string, subs?: string[]) => browser.i18n.getMessage(key, subs);
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const scanButton = el<HTMLButtonElement>('scan');
const deleteButton = el<HTMLButtonElement>('delete');
const status = el<HTMLParagraphElement>('status');
const results = el<HTMLDivElement>('results');
const footer = el<HTMLDivElement>('footer');

let outcome: ScanOutcome | undefined;
const selected = new Set<string>(); // group keys chosen for deletion

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function renderRow(group: ClassifiedGroup, checked: boolean): HTMLLIElement {
  const li = document.createElement('li');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  if (checked) selected.add(group.key);
  checkbox.addEventListener('change', () => {
    checkbox.checked ? selected.add(group.key) : selected.delete(group.key);
    updateDeleteButton();
  });
  li.append(checkbox);

  const domain = document.createElement('span');
  domain.className = 'domain';
  domain.textContent = group.registrableDomain;
  domain.title = group.partitionSite
    ? msg('partitionedUnder', [group.partitionSite])
    : group.registrableDomain;
  li.append(domain);

  const containerName = outcome?.containerNames[group.storeId];
  if (containerName) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = containerName;
    li.append(badge);
  }
  if (group.partitionSite) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = msg('partitionedBadge');
    badge.title = msg('partitionedUnder', [group.partitionSite]);
    li.append(badge);
  }

  const meta = document.createElement('span');
  meta.className = 'meta';
  const parts = [msg('cookieCount', [String(group.cookies.length)])];
  if (group.lastVisitTime !== undefined) {
    parts.push(msg('lastVisit', [dateFormat.format(group.lastVisitTime)]));
  }
  meta.textContent = parts.join(' · ');
  li.append(meta);

  const protect = document.createElement('button');
  protect.className = 'protect';
  protect.textContent = msg('protectButton');
  protect.addEventListener('click', async () => {
    await addToWhitelist(group.registrableDomain);
    await runScan();
  });
  li.append(protect);

  return li;
}

function renderResults(): void {
  if (!outcome) return;
  selected.clear();

  const stale = outcome.groups.filter((g) => g.verdict === 'stale');
  const unknown = outcome.groups.filter((g) => g.verdict === 'unknown');
  const fresh = outcome.groups.filter((g) => g.verdict === 'fresh');
  const whitelisted = outcome.groups.filter((g) => g.verdict === 'whitelisted');

  el('stale-title').textContent = msg('sectionStale', [String(stale.length)]);
  el('unknown-title').textContent = msg('sectionUnknown', [String(unknown.length)]);
  el('summary').textContent = msg('summaryFreshProtected', [
    String(fresh.length),
    String(whitelisted.length),
  ]);

  const staleList = el<HTMLUListElement>('stale-list');
  const unknownList = el<HTMLUListElement>('unknown-list');
  staleList.replaceChildren(...stale.map((g) => renderRow(g, true)));
  unknownList.replaceChildren(...unknown.map((g) => renderRow(g, false)));

  results.hidden = false;
  footer.hidden = false;
  status.textContent = outcome.groups.length === 0 ? msg('emptyState') : '';
  updateDeleteButton();
}

function updateDeleteButton(): void {
  const count = selectedGroups().reduce((n, g) => n + g.cookies.length, 0);
  deleteButton.textContent = msg('deleteButton', [String(count)]);
  deleteButton.disabled = count === 0;
}

function selectedGroups(): ClassifiedGroup[] {
  return outcome?.groups.filter((g) => selected.has(g.key)) ?? [];
}

async function runScan(): Promise<void> {
  scanButton.disabled = true;
  status.textContent = msg('popupScanning');
  try {
    outcome = await scanCookies(await loadSettings());
    renderResults();
  } finally {
    scanButton.disabled = false;
  }
}

scanButton.addEventListener('click', () => void runScan());

deleteButton.addEventListener('click', async () => {
  deleteButton.disabled = true;
  const removed = await deleteCookieGroups(selectedGroups());
  status.textContent = msg('deletedToast', [String(removed)]);
  await runScan();
});
