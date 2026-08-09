import browser from 'webextension-polyfill';
import { localizePage } from '../ui/i18n';
import { scan, deleteGroups, type ScanOutcome } from '../ext/scanner';
import { loadSettings, addToWhitelist, type Settings } from '../ext/settings';
import { reminderDue, resetReminderTimer } from '../ext/reminder';
import { getSnapshot, restoreSnapshot } from '../ext/snapshot';
import { installErrorCapture, recordError } from '../ext/errorLog';
import { shouldPreselectUnknown, type ClassifiedGroup } from '../core/classify';
import { buildSiteRows, type SiteRow } from '../core/rows';

installErrorCapture('popup');
localizePage();

const msg = (key: string, subs?: string[]) => browser.i18n.getMessage(key, subs);
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const scanButton = el<HTMLButtonElement>('scan');
const skipButton = el<HTMLButtonElement>('skip');
const undoButton = el<HTMLButtonElement>('undo');
const deleteButton = el<HTMLButtonElement>('delete');
const confirmBox = el<HTMLDivElement>('confirm');
const confirmText = el<HTMLSpanElement>('confirm-text');
const confirmDelete = el<HTMLButtonElement>('confirm-delete');
const confirmCancel = el<HTMLButtonElement>('confirm-cancel');
const status = el<HTMLParagraphElement>('status');
const results = el<HTMLDivElement>('results');
const footer = el<HTMLDivElement>('footer');

let outcome: ScanOutcome | undefined;
let settings: Settings | undefined;
let rows: SiteRow[] = [];
const selected = new Set<string>(); // row domains chosen for deletion

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function itemCount(group: ClassifiedGroup): number {
  switch (group.kind) {
    case 'cookies':
      return group.cookies.length;
    case 'history':
      return group.urls.length;
    case 'downloads':
      return group.downloadIds.length;
  }
}

/** "12 cookies · 340 history entries · 2 downloads" for what the row would delete. */
function countLabels(row: SiteRow): string[] {
  const counts = { cookies: 0, history: 0, downloads: 0 };
  for (const group of row.deletable) counts[group.kind] += itemCount(group);
  const parts: string[] = [];
  if (counts.cookies) parts.push(msg('cookieCount', [String(counts.cookies)]));
  if (counts.history) parts.push(msg('historyCount', [String(counts.history)]));
  if (counts.downloads) parts.push(msg('downloadCount', [String(counts.downloads)]));
  return parts;
}

function addBadge(li: HTMLLIElement, text: string, title?: string): void {
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = text;
  if (title) badge.title = title;
  li.append(badge);
}

function renderRow(row: SiteRow, checked: boolean): HTMLLIElement {
  const li = document.createElement('li');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  if (checked) selected.add(row.domain);
  checkbox.addEventListener('change', () => {
    checkbox.checked ? selected.add(row.domain) : selected.delete(row.domain);
    updateDeleteButton();
  });
  li.append(checkbox);

  const domain = document.createElement('span');
  domain.className = 'domain';
  domain.textContent = row.domain;
  domain.title = row.domain;
  li.append(domain);

  const containerBadges = new Set<string>();
  let partitionedBadge: string | undefined;
  for (const group of row.deletable) {
    if (group.kind !== 'cookies') continue;
    const containerName = outcome?.containerNames[group.storeId];
    if (containerName) containerBadges.add(containerName);
    if (group.partitionSite) partitionedBadge = group.partitionSite;
  }
  for (const name of containerBadges) addBadge(li, name);
  if (partitionedBadge) {
    addBadge(li, msg('partitionedBadge'), msg('partitionedUnder', [row.domain]));
  }

  const meta = document.createElement('span');
  meta.className = 'meta';
  const parts = countLabels(row);
  if (row.lastVisitTime !== undefined) {
    parts.push(msg('lastVisit', [dateFormat.format(row.lastVisitTime)]));
  }
  meta.textContent = parts.join(' · ');
  li.append(meta);

  const protect = document.createElement('button');
  protect.className = 'protect quiet';
  protect.textContent = msg('protectButton');
  protect.addEventListener('click', async () => {
    await addToWhitelist(row.domain);
    await runScan();
  });
  li.append(protect);

  return li;
}

function renderResults(): void {
  if (!outcome) return;
  selected.clear();
  rows = buildSiteRows(outcome.groups);

  const stale = rows.filter((r) => r.verdict === 'stale');
  const unknown = rows.filter((r) => r.verdict === 'unknown');
  const freshRows = rows.filter((r) => r.verdict === 'fresh');
  const protectedDomains = new Set(
    outcome.groups.filter((g) => g.verdict === 'whitelisted').map((g) => g.registrableDomain),
  );

  el('stale-title').textContent = msg('sectionStale', [String(stale.length)]);
  el('unknown-title').textContent = msg('sectionUnknown', [String(unknown.length)]);
  el('summary').textContent = msg('summaryFreshProtected', [
    String(freshRows.length),
    String(protectedDomains.size),
  ]);

  const preselectUnknown = shouldPreselectUnknown(
    outcome.groups,
    settings?.keepNeverVisited ?? false,
  );
  const staleList = el<HTMLUListElement>('stale-list');
  const unknownList = el<HTMLUListElement>('unknown-list');
  staleList.replaceChildren(...stale.map((r) => renderRow(r, true)));
  unknownList.replaceChildren(...unknown.map((r) => renderRow(r, preselectUnknown)));

  results.hidden = false;
  footer.hidden = false;
  status.textContent = outcome.groups.length === 0 ? msg('emptyState') : '';
  updateDeleteButton();
}

function selectedDeletable(): ClassifiedGroup[] {
  return rows.filter((r) => selected.has(r.domain)).flatMap((r) => r.deletable);
}

function updateDeleteButton(): void {
  closeConfirm(); // selection changed — a pending confirmation is stale
  const count = selectedDeletable().reduce((n, g) => n + itemCount(g), 0);
  deleteButton.textContent = msg('deleteButton', [String(count)]);
  deleteButton.disabled = count === 0;
}

function closeConfirm(): void {
  confirmBox.hidden = true;
  deleteButton.hidden = false;
}

/**
 * Undo is offered whenever a snapshot of the last deletion exists — also on
 * popup open, so an automatic clean (no preview) can still be undone until
 * the browser closes or the next deletion replaces the snapshot.
 */
async function updateUndoButton(): Promise<void> {
  const snapshot = await getSnapshot();
  if (snapshot && snapshot.cookies.length > 0) {
    undoButton.textContent = msg('popupUndoButton', [String(snapshot.cookies.length)]);
    undoButton.hidden = false;
  } else {
    undoButton.hidden = true;
  }
}

async function runScan(): Promise<void> {
  scanButton.disabled = true;
  status.textContent = msg('popupScanning');
  try {
    settings = await loadSettings();
    outcome = await scan(settings);
    renderResults();
  } catch (error) {
    // A stuck "Scanning…" is unreportable — log it and say something failed.
    recordError('popup', error);
    status.textContent = msg('popupFailed');
  } finally {
    scanButton.disabled = false;
  }
}

el<HTMLButtonElement>('options').addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
  window.close();
});

scanButton.addEventListener('click', () => void runScan());

skipButton.addEventListener('click', async () => {
  await resetReminderTimer();
  skipButton.hidden = true;
});

// Native dialogs don't render their message over popup panels on Firefox,
// so the confirmation is inline: Delete swaps to a message + confirm/cancel.
deleteButton.addEventListener('click', () => {
  const count = selectedDeletable().reduce((n, g) => n + itemCount(g), 0);
  confirmText.textContent = msg('popupDeleteConfirm', [String(count)]);
  deleteButton.hidden = true;
  confirmBox.hidden = false;
});

confirmCancel.addEventListener('click', closeConfirm);

undoButton.addEventListener('click', async () => {
  undoButton.disabled = true;
  try {
    const restored = await restoreSnapshot();
    status.textContent = msg('popupRestoredToast', [String(restored)]);
  } catch (error) {
    recordError('popup', error);
    status.textContent = msg('popupFailed');
  } finally {
    undoButton.disabled = false;
  }
  await updateUndoButton();
  // The restored cookies are still stale — rescan so the preview is honest.
  if (outcome) await runScan();
});

confirmDelete.addEventListener('click', async () => {
  confirmDelete.disabled = true;
  try {
    const removed = await deleteGroups(selectedDeletable());
    status.textContent = msg('deletedToast', [String(removed)]);
  } catch (error) {
    recordError('popup', error);
    status.textContent = msg('popupFailed');
    closeConfirm();
    return; // a failed clean is no clean — leave the reminder cycle alone
  } finally {
    confirmDelete.disabled = false;
  }
  closeConfirm();
  await updateUndoButton();
  // Cleaning starts a new reminder cycle.
  await resetReminderTimer();
  skipButton.hidden = true;
  await runScan();
});

// Offer "skip this reminder" only while a reminder is actually due.
void loadSettings().then(async (loaded) => {
  skipButton.hidden = !(await reminderDue(loaded));
});

void updateUndoButton();
