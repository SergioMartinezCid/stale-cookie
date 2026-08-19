import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { By, type WebDriver } from 'selenium-webdriver';
import {
  extensionPage,
  inExtensionPage,
  launchWithExtension,
  readRows,
  scanAndWait,
} from './harness';

/**
 * End-to-end flow against a real headless Firefox with a throwaway profile:
 * seed → scan → protect → delete → undo, verifying through the browser's own
 * APIs what was actually removed and restored. Tests share one browser and
 * run in order — each builds on the previous one's state, like a user would.
 *
 * Seeded world (defaults: cookies stale after 90 d, history after 180 d):
 *  - fresh-shop.example     visited 5 d ago   → fresh, summary only
 *  - stale-forum.example    visited 120 d ago → stale row, cookies only
 *    (its history is younger than 180 d and must survive the deletion)
 *  - ancient-news.example   visited 300 d ago → stale row: cookies + history
 *    + a container cookie + a partitioned cookie (widget-cdn.example)
 *  - old-bank.example       visited 400 d ago → stale, then protected
 *  - ghost-tracker.example  cookie, no visit  → "no visit recorded",
 *    preselected (mixed scan)
 */

const DAY_MS = 86_400_000;

let driver: WebDriver;
let containerStoreId: string;

/** All cookies visible to the extension, as "domain|storeId|name" keys. */
async function allCookieKeys(): Promise<Set<string>> {
  const keys = await inExtensionPage<string[]>(
    driver,
    `const all = [];
     for (const storeId of ['firefox-default', '${containerStoreId}']) {
       all.push(...(await browser.cookies.getAll({ storeId, partitionKey: {} })));
     }
     return all.map((c) =>
       (c.domain.startsWith('.') ? c.domain.slice(1) : c.domain) + '|' + c.storeId + '|' + c.name,
     );`,
  );
  return new Set(keys);
}

async function historyHosts(): Promise<Set<string>> {
  const hosts = await inExtensionPage<string[]>(
    driver,
    `const items = await browser.history.search({ text: '', startTime: 0, maxResults: 1000 });
     return items.map((i) => new URL(i.url).hostname);`,
  );
  return new Set(hosts);
}

async function actionLogTypes(): Promise<string[]> {
  return inExtensionPage<string[]>(
    driver,
    `const stored = await browser.storage.local.get('actionLog');
     return (stored.actionLog ?? []).map((e) => e.type);`,
  );
}

beforeAll(async () => {
  driver = await launchWithExtension();
  await driver.get(extensionPage('popup/popup.html'));

  containerStoreId = await inExtensionPage<string>(
    driver,
    `const DAY = ${DAY_MS};
     const now = Date.now();
     const inAYear = Math.floor(now / 1000) + 365 * 86_400;
     const addSite = async (domain, daysAgo, urls, cookies) => {
       for (let i = 0; i < urls; i++) {
         await browser.history.addUrl({
           url: 'https://' + domain + '/page-' + i,
           title: domain + ' page ' + i,
           visitTime: now - daysAgo * DAY - i * 60_000,
         });
       }
       for (let i = 0; i < cookies; i++) {
         await browser.cookies.set({
           url: 'https://' + domain + '/',
           name: 'seed' + i,
           value: 'x',
           secure: true,
           expirationDate: inAYear,
         });
       }
     };
     await addSite('fresh-shop.example', 5, 2, 2);
     await addSite('stale-forum.example', 120, 2, 2);
     await addSite('ancient-news.example', 300, 5, 3);
     await addSite('old-bank.example', 400, 2, 2);
     await browser.cookies.set({
       url: 'https://ghost-tracker.example/',
       name: 'ghost', value: 'x', secure: true, expirationDate: inAYear,
     });
     await browser.cookies.set({
       url: 'https://widget-cdn.example/',
       name: 'partitioned-seed', value: 'x', secure: true, expirationDate: inAYear,
       partitionKey: { topLevelSite: 'https://ancient-news.example' },
     });
     const container = await browser.contextualIdentities.create({
       name: 'Integration', color: 'blue', icon: 'briefcase',
     });
     await browser.cookies.set({
       url: 'https://ancient-news.example/',
       name: 'container-seed', value: 'x', secure: true, expirationDate: inAYear,
       storeId: container.cookieStoreId,
     });
     return container.cookieStoreId;`,
  );
});

afterAll(async () => {
  await driver?.quit();
});

describe('cleaning flow', () => {
  it('classifies seeded sites into stale / no-visit / fresh', async () => {
    await scanAndWait(driver);

    const stale = await readRows(driver, 'stale-list');
    const staleDomains = stale.map((r) => r.domain);
    expect(staleDomains).toContain('ancient-news.example');
    expect(staleDomains).toContain('stale-forum.example');
    expect(staleDomains).toContain('old-bank.example');
    expect(staleDomains).not.toContain('fresh-shop.example');
    // Stale rows are always preselected.
    expect(stale.every((r) => r.checked)).toBe(true);
    // stale-forum's history (120 d) is younger than the 180 d history
    // threshold — the row must offer its cookies only.
    const forum = stale.find((r) => r.domain === 'stale-forum.example');
    expect(forum?.meta).toContain('2 cookies');
    expect(forum?.meta).not.toContain('history');

    // Mixed scan (some sites have visits) → never-visited preselected.
    const unknown = await readRows(driver, 'unknown-list');
    expect(unknown.map((r) => r.domain)).toEqual(['ghost-tracker.example']);
    expect(unknown[0]?.checked).toBe(true);
  });

  it('folds container and partitioned cookies into the site row with badges', async () => {
    const stale = await readRows(driver, 'stale-list');
    const ancient = stale.find((r) => r.domain === 'ancient-news.example');
    expect(ancient).toBeDefined();
    expect(ancient?.badges).toContain('Integration'); // container name
    expect(ancient?.badges).toContain('partitioned');
  });

  it('protects a site via the row button and drops it from the preview', async () => {
    await driver.executeScript(
      `const row = Array.from(document.querySelectorAll('#stale-list li'))
         .find((li) => li.querySelector('.domain').textContent === 'old-bank.example');
       row.querySelector('.protect').click();`,
    );
    // Protect triggers an automatic rescan.
    await driver.wait(
      async () =>
        !(await readRows(driver, 'stale-list')).some((r) => r.domain === 'old-bank.example'),
      20_000,
      'old-bank.example still listed after protecting it',
    );

    const whitelist = await inExtensionPage<string[]>(
      driver,
      `return (await browser.storage.local.get('settings')).settings.whitelist;`,
    );
    expect(whitelist).toContain('old-bank.example');
  });

  it('deletes the selected rows: their cookies and only stale history', async () => {
    await driver.findElement(By.id('delete')).click();
    await driver.wait(
      async () => driver.findElement(By.id('confirm')).isDisplayed(),
      5_000,
      'inline confirmation did not appear',
    );
    await driver.findElement(By.id('confirm-delete')).click();
    // Deletion finishes, then the popup rescans; the undo button appears
    // as soon as the deletion itself is done.
    await driver.wait(
      async () => driver.findElement(By.id('undo')).isDisplayed(),
      20_000,
      'undo button did not appear after deleting',
    );
    await driver.wait(
      async () =>
        (await driver.findElement(By.id('scan')).isEnabled()) &&
        !(await readRows(driver, 'stale-list')).some((r) => r.domain === 'ancient-news.example'),
      20_000,
      'rescan after deletion did not settle',
    );

    const cookies = await allCookieKeys();
    // Deleted: all cookies of the checked rows, in every store.
    expect(cookies.has('ancient-news.example|firefox-default|seed0')).toBe(false);
    expect(cookies.has(`ancient-news.example|${containerStoreId}|container-seed`)).toBe(false);
    expect(cookies.has('widget-cdn.example|firefox-default|partitioned-seed')).toBe(false);
    expect(cookies.has('stale-forum.example|firefox-default|seed0')).toBe(false);
    expect(cookies.has('ghost-tracker.example|firefox-default|ghost')).toBe(false);
    // Kept: fresh and protected sites.
    expect(cookies.has('fresh-shop.example|firefox-default|seed0')).toBe(true);
    expect(cookies.has('old-bank.example|firefox-default|seed0')).toBe(true);

    const history = await historyHosts();
    // ancient-news history (300 d) was stale and is gone; stale-forum's
    // (120 d) was still fresh for the history type and must survive.
    expect(history.has('ancient-news.example')).toBe(false);
    expect(history.has('stale-forum.example')).toBe(true);
    expect(history.has('fresh-shop.example')).toBe(true);
    expect(history.has('old-bank.example')).toBe(true);

    expect(await actionLogTypes()).toEqual(
      expect.arrayContaining(['delete-cookies', 'delete-history']),
    );
  });

  it('restores every deleted cookie from the undo snapshot', async () => {
    const undoLabel = await driver.findElement(By.id('undo')).getText();
    expect(undoLabel).toContain('(8)'); // 3+1 ancient + 1 partitioned + 2 forum + 1 ghost

    await driver.findElement(By.id('undo')).click();
    await driver.wait(
      async () => !(await driver.findElement(By.id('undo')).isDisplayed()),
      20_000,
      'undo button did not disappear after restoring',
    );

    const cookies = await allCookieKeys();
    expect(cookies.has('ancient-news.example|firefox-default|seed0')).toBe(true);
    expect(cookies.has('ancient-news.example|firefox-default|seed2')).toBe(true);
    expect(cookies.has(`ancient-news.example|${containerStoreId}|container-seed`)).toBe(true);
    expect(cookies.has('widget-cdn.example|firefox-default|partitioned-seed')).toBe(true);
    expect(cookies.has('stale-forum.example|firefox-default|seed1')).toBe(true);
    expect(cookies.has('ghost-tracker.example|firefox-default|ghost')).toBe(true);

    expect(await actionLogTypes()).toContain('restore-cookies');

    // The restored cookies reappear in the rescan. stale-forum still has
    // its (young) history, so it is stale again; ancient-news's history was
    // deleted, so its restored cookies now have no recorded visit — the
    // documented "deleted history leaves cookies looking never-visited"
    // behavior.
    await driver.wait(
      async () =>
        (await readRows(driver, 'stale-list')).some((r) => r.domain === 'stale-forum.example') &&
        (await readRows(driver, 'unknown-list')).some(
          (r) => r.domain === 'ancient-news.example',
        ),
      20_000,
      'restored cookies did not reappear in the rescan',
    );
  });

  it('keeps the preview and hand-tuned selections across popup teardown', async () => {
    // Uncheck stale-forum by hand, then reload the page — the same teardown
    // a click outside the popup causes.
    await driver.executeScript(
      `const row = Array.from(document.querySelectorAll('#stale-list li'))
         .find((li) => li.querySelector('.domain').textContent === 'stale-forum.example');
       row.querySelector('input[type=checkbox]').click();`,
    );
    await driver.navigate().refresh();
    await driver.wait(
      async () => (await readRows(driver, 'stale-list')).length > 0,
      20_000,
      'preview was not restored after reopening the popup',
    );
    const forum = (await readRows(driver, 'stale-list')).find(
      (r) => r.domain === 'stale-forum.example',
    );
    expect(forum?.checked).toBe(false); // the hand-tuned choice survived
  });

  it('dismisses the preview and its cache with Clear results', async () => {
    await driver.findElement(By.id('clear-results')).click();
    await driver.wait(
      async () => !(await driver.findElement(By.id('results')).isDisplayed()),
      5_000,
      'results did not hide after Clear',
    );
    // The cache is gone too — deterministic check, no reopen race.
    const cached = await inExtensionPage<unknown>(
      driver,
      `return (await browser.storage.session.get('scanCache')).scanCache ?? null;`,
    );
    expect(cached).toBeNull();
  });
});
