import browser from 'webextension-polyfill';
import { localizePage } from '../ui/i18n';
import { scan, deleteGroups, type ScanOutcome } from '../ext/scanner';
import {
  loadSettings,
  addToWhitelist,
  removeFromWhitelist,
  type Settings,
} from '../ext/settings';
import { reminderDue, resetReminderTimer } from '../ext/reminder';
import { getSnapshot, restoreSnapshot, SNAPSHOT_TTL_MS } from '../ext/snapshot';
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
const toast = el<HTMLParagraphElement>('toast');
const reminderBanner = el<HTMLParagraphElement>('reminder-banner');
const undoDetail = el<HTMLParagraphElement>('undo-detail');
const results = el<HTMLDivElement>('results');
const footer = el<HTMLDivElement>('footer');

let outcome: ScanOutcome | undefined;
let settings: Settings | undefined;
let rows: SiteRow[] = [];
const selected = new Set<string>(); // row domains chosen for deletion
/**
 * The user's explicit checkbox choices, by domain. Rescans (after protect,
 * delete, undo) rebuild every row; without this, a hand-tuned selection
 * would silently reset to the preselection defaults.
 */
const overrides = new Map<string, boolean>();

type Section = 'stale' | 'unknown';
/** Per-section row checkboxes (rebuilt on every render), for select-all. */
const rowCheckboxes: Record<Section, Map<string, HTMLInputElement>> = {
  stale: new Map(),
  unknown: new Map(),
};
const masterCheckbox: Record<Section, HTMLInputElement> = {
  stale: el<HTMLInputElement>('stale-all'),
  unknown: el<HTMLInputElement>('unknown-all'),
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * Outcome feedback lives in its own element so the rescan that follows a
 * deletion or restore cannot wipe it (the status line is rewritten by every
 * scan). Errors are announced assertively — they point at the error log.
 */
function showToast(text: string, kind: 'success' | 'error'): void {
  toast.textContent = text;
  toast.className = kind;
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  toast.hidden = false;
}

function clearToast(): void {
  toast.hidden = true;
  toast.textContent = '';
}

/** "Protected example.com. [Undo]" — a mis-click shouldn't need a trip to the options page. */
function showProtectedToast(domain: string): void {
  toast.textContent = '';
  toast.className = 'success';
  toast.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = msg('protectedToast', [domain]);
  const undo = document.createElement('button');
  undo.className = 'quiet';
  undo.textContent = msg('protectedUndo');
  undo.addEventListener('click', async () => {
    await removeFromWhitelist(domain);
    clearToast();
    await runScan();
  });
  toast.append(text, ' ', undo);
  toast.hidden = false;
}

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

function addBadge(parent: HTMLElement, text: string, title?: string, color?: string): void {
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = text;
  if (title) badge.title = title;
  if (color) {
    // Container badges echo the container's own Firefox color.
    badge.style.borderColor = color;
    badge.style.color = color;
  }
  parent.append(badge);
}

/** Reflect the section's row states on its select-all checkbox. */
function updateMaster(section: Section): void {
  const boxes = [...rowCheckboxes[section].values()];
  const checked = boxes.filter((box) => box.checked).length;
  masterCheckbox[section].checked = checked > 0 && checked === boxes.length;
  masterCheckbox[section].indeterminate = checked > 0 && checked < boxes.length;
}

for (const section of ['stale', 'unknown'] as const) {
  masterCheckbox[section].addEventListener('change', () => {
    const check = masterCheckbox[section].checked;
    for (const [domain, box] of rowCheckboxes[section]) {
      box.checked = check;
      check ? selected.add(domain) : selected.delete(domain);
      overrides.set(domain, check);
    }
    updateMaster(section);
    updateDeleteButton();
  });
}

function renderRow(row: SiteRow, checked: boolean): HTMLLIElement {
  const li = document.createElement('li');
  const section: Section = row.verdict === 'stale' ? 'stale' : 'unknown';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  if (checked) selected.add(row.domain);
  rowCheckboxes[section].set(row.domain, checkbox);
  checkbox.addEventListener('change', () => {
    checkbox.checked ? selected.add(row.domain) : selected.delete(row.domain);
    overrides.set(row.domain, checkbox.checked);
    updateMaster(section);
    updateDeleteButton();
  });
  li.append(checkbox);

  const site = document.createElement('span');
  site.className = 'site';
  const domain = document.createElement('span');
  domain.className = 'domain';
  domain.textContent = row.domain;
  domain.title = row.domain;
  site.append(domain);

  const containerBadges = new Map<string, string | undefined>(); // name → colorCode
  let partitionedBadge: string | undefined;
  for (const group of row.deletable) {
    if (group.kind !== 'cookies') continue;
    const container = outcome?.containers[group.storeId];
    if (container) containerBadges.set(container.name, container.colorCode);
    if (group.partitionSite) partitionedBadge = group.partitionSite;
  }
  for (const [name, color] of containerBadges) addBadge(site, name, undefined, color);
  if (partitionedBadge) {
    addBadge(site, msg('partitionedBadge'), msg('partitionedUnder', [row.domain]));
  }
  li.append(site);

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
    showProtectedToast(row.domain);
    await runScan();
  });
  li.append(protect);

  return li;
}

function renderResults(): void {
  if (!outcome) return;
  selected.clear();
  rowCheckboxes.stale.clear();
  rowCheckboxes.unknown.clear();
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
  staleList.replaceChildren(...stale.map((r) => renderRow(r, overrides.get(r.domain) ?? true)));
  unknownList.replaceChildren(
    ...unknown.map((r) => renderRow(r, overrides.get(r.domain) ?? preselectUnknown)),
  );

  // Empty sections are noise — and a fully clean scan is good news, not
  // two zero-count headings over a disabled delete button.
  el('stale-head').hidden = stale.length === 0;
  staleList.hidden = stale.length === 0;
  el('unknown-head').hidden = unknown.length === 0;
  unknownList.hidden = unknown.length === 0;
  const hasRows = stale.length > 0 || unknown.length > 0;
  updateMaster('stale');
  updateMaster('unknown');

  results.hidden = false;
  footer.hidden = !hasRows;
  status.className = '';
  if (outcome.groups.length === 0) {
    status.textContent = msg('emptyState');
  } else if (!hasRows) {
    status.textContent = msg('allClean');
    status.className = 'success';
  } else {
    status.textContent = msg('scanSummary', [String(stale.length), String(unknown.length)]);
  }
  updateDeleteButton();
}

function selectedDeletable(): ClassifiedGroup[] {
  return rows.filter((r) => selected.has(r.domain)).flatMap((r) => r.deletable);
}

function updateDeleteButton(): void {
  closeConfirm(); // selection changed — a pending confirmation is stale
  const chosen = rows.filter((r) => selected.has(r.domain));
  const count = chosen.flatMap((r) => r.deletable).reduce((n, g) => n + itemCount(g), 0);
  deleteButton.textContent = msg('deleteButton', [String(count), String(chosen.length)]);
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
    // Which deletion this covers and how long it stays undoable — vital
    // context when the deletion was an unattended automatic clean.
    undoDetail.textContent = msg('popupUndoDetail', [
      dateTimeFormat.format(snapshot.at),
      dateTimeFormat.format(snapshot.at + SNAPSHOT_TTL_MS),
    ]);
    undoDetail.hidden = false;
  } else {
    undoButton.hidden = true;
    undoDetail.hidden = true;
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
    status.textContent = '';
    showToast(msg('popupFailed'), 'error');
  } finally {
    scanButton.disabled = false;
  }
}

const optionsButton = el<HTMLButtonElement>('options');
// Icon-only button — its name comes from i18n, not visible text.
optionsButton.title = msg('popupOptionsButton');
optionsButton.setAttribute('aria-label', msg('popupOptionsButton'));
optionsButton.addEventListener('click', () => {
  void browser.runtime.openOptionsPage();
  window.close();
});

scanButton.addEventListener('click', () => {
  clearToast(); // a fresh user-initiated scan starts a clean slate
  void runScan();
});

skipButton.addEventListener('click', async () => {
  await resetReminderTimer();
  skipButton.hidden = true;
  reminderBanner.hidden = true;
  const days = (settings ?? (await loadSettings())).reminderDays;
  showToast(msg('popupReminderSkipped', [String(days)]), 'success');
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
    showToast(msg('popupRestoredToast', [String(restored)]), 'success');
  } catch (error) {
    recordError('popup', error);
    showToast(msg('popupFailed'), 'error');
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
    showToast(msg('deletedToast', [String(removed)]), 'success');
  } catch (error) {
    recordError('popup', error);
    showToast(msg('popupFailed'), 'error');
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
  reminderBanner.hidden = true;
  await runScan();
});

// Offer "skip this reminder" only while a reminder is actually due — and
// scan right away in that case: the user opened the popup to clean, so save
// the click. Scanning is read-only; the preview still gates any deletion.
void loadSettings().then(async (loaded) => {
  settings = loaded;
  const due = await reminderDue(loaded);
  skipButton.hidden = !due;
  if (due) {
    // The bare Skip button gave zero context on why it was there.
    reminderBanner.textContent = msg('popupReminderBanner', [String(loaded.reminderDays)]);
    reminderBanner.hidden = false;
    await runScan();
  }
});

void updateUndoButton();
