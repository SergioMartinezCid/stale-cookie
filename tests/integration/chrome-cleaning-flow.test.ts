import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { By, type WebDriver } from 'selenium-webdriver';
import {
  chromeExtensionPage,
  inExtensionPage,
  launchChromeWithExtension,
  readRows,
  scanAndWait,
} from './harness';

/**
 * Chrome port verification: the same popup flow as the Firefox suite, driven
 * in headless Chrome for Testing against dist-chrome/. Chrome's
 * history.addUrl cannot backdate visits (no visitTime parameter), so
 * staleness is produced the other way around: seed visits "now", then write
 * sub-second thresholds straight into storage (the options UI enforces the
 * 1-day minimum; loadSettings deliberately doesn't) and rescan. Containers
 * are Firefox-only and covered there; partitioned cookies exist on both and
 * are covered here too.
 */

let driver: WebDriver;
let extensionId: string;

function popupUrl(): string {
  return chromeExtensionPage(extensionId, 'popup/popup.html');
}

async function allCookieKeys(): Promise<Set<string>> {
  const keys = await inExtensionPage<string[]>(
    driver,
    `const cookies = await browser.cookies.getAll({ partitionKey: {} });
     return cookies.map((c) => c.domain.replace(/^\\./, '') + '|' + c.name);`,
  );
  return new Set(keys);
}

async function historyHosts(): Promise<Set<string>> {
  const hosts = await inExtensionPage<string[]>(
    driver,
    `const items = await browser.history.search({ text: '', startTime: 0, maxResults: 1000 });
     return items.map((item) => new URL(item.url).hostname);`,
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
  ({ driver, extensionId } = await launchChromeWithExtension());
  await driver.get(popupUrl());

  await inExtensionPage(
    driver,
    `const inAYear = Math.floor(Date.now() / 1000) + 365 * 86_400;
     const addSite = async (domain, urls, cookies) => {
       for (let i = 0; i < urls; i++) {
         await browser.history.addUrl({ url: 'https://' + domain + '/page-' + i });
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
     await addSite('visited-shop.example', 2, 2);
     await addSite('visited-news.example', 2, 3);
     await browser.cookies.set({
       url: 'https://ghost-tracker.example/',
       name: 'ghost', value: 'x', secure: true, expirationDate: inAYear,
     });
     // CHIPS requires Secure + SameSite=None.
     await browser.cookies.set({
       url: 'https://widget-cdn.example/',
       name: 'partitioned-seed', value: 'x', secure: true, expirationDate: inAYear,
       sameSite: 'no_restriction',
       partitionKey: { topLevelSite: 'https://visited-news.example' },
     });`,
  );
});

afterAll(async () => {
  await driver?.quit();
});

describe('cleaning flow on Chrome', () => {
  it('offers only the never-visited site while visits are fresh', async () => {
    await scanAndWait(driver);

    expect(await readRows(driver, 'stale-list')).toEqual([]);
    // Mixed scan (other sites have visits) → never-visited preselected.
    const unknown = await readRows(driver, 'unknown-list');
    expect(unknown.map((r) => r.domain)).toEqual(['ghost-tracker.example']);
    expect(unknown[0]?.checked).toBe(true);
  });

  it('classifies the seeded sites as stale under sub-second thresholds', async () => {
    await inExtensionPage(
      driver,
      `const stored = await browser.storage.local.get('settings');
       await browser.storage.local.set({ settings: {
         ...(stored.settings ?? {}),
         cookieThresholdDays: 1e-6,
         historyThresholdDays: 1e-6,
       } });`,
    );
    // Fresh page load so the popup picks up the new thresholds.
    await driver.get(popupUrl());
    await scanAndWait(driver);

    const stale = await readRows(driver, 'stale-list');
    const staleDomains = stale.map((r) => r.domain);
    expect(staleDomains).toContain('visited-shop.example');
    expect(staleDomains).toContain('visited-news.example');
    expect(stale.every((r) => r.checked)).toBe(true);

    // The partitioned cookie folds into its partition site's row.
    const news = stale.find((r) => r.domain === 'visited-news.example');
    expect(news?.badges).toContain('partitioned');
  });

  it('deletes the selected rows and logs the deletion', async () => {
    await driver.findElement(By.id('delete')).click();
    await driver.wait(
      async () => driver.findElement(By.id('confirm')).isDisplayed(),
      5_000,
      'inline confirmation did not appear',
    );
    await driver.findElement(By.id('confirm-delete')).click();
    await driver.wait(
      async () => driver.findElement(By.id('undo')).isDisplayed(),
      20_000,
      'undo button did not appear after deleting',
    );
    await driver.wait(
      async () =>
        (await driver.findElement(By.id('scan')).isEnabled()) &&
        !(await readRows(driver, 'stale-list')).some((r) => r.domain === 'visited-news.example'),
      20_000,
      'rescan after deletion did not settle',
    );

    const cookies = await allCookieKeys();
    expect(cookies.has('visited-shop.example|seed0')).toBe(false);
    expect(cookies.has('visited-news.example|seed0')).toBe(false);
    expect(cookies.has('widget-cdn.example|partitioned-seed')).toBe(false);
    expect(cookies.has('ghost-tracker.example|ghost')).toBe(false);

    const history = await historyHosts();
    expect(history.has('visited-shop.example')).toBe(false);
    expect(history.has('visited-news.example')).toBe(false);

    expect(await actionLogTypes()).toEqual(
      expect.arrayContaining(['delete-cookies', 'delete-history']),
    );
  });

  it('restores every deleted cookie from the undo snapshot', async () => {
    // 2 shop + 3 news + 1 partitioned + 1 ghost.
    expect(await driver.findElement(By.id('undo')).getText()).toContain('(7)');

    await driver.findElement(By.id('undo')).click();
    await driver.wait(
      async () => !(await driver.findElement(By.id('undo')).isDisplayed()),
      20_000,
      'undo button did not disappear after restoring',
    );

    const cookies = await allCookieKeys();
    expect(cookies.has('visited-shop.example|seed0')).toBe(true);
    expect(cookies.has('visited-shop.example|seed1')).toBe(true);
    expect(cookies.has('visited-news.example|seed2')).toBe(true);
    expect(cookies.has('widget-cdn.example|partitioned-seed')).toBe(true);
    expect(cookies.has('ghost-tracker.example|ghost')).toBe(true);

    expect(await actionLogTypes()).toContain('restore-cookies');
  });
});
