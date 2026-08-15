import { afterAll, beforeAll, describe, it } from 'vitest';
import { By, type WebDriver } from 'selenium-webdriver';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { extensionPage, inExtensionPage, launchWithExtension, scanAndWait } from '../integration/harness';

/**
 * Generates the raw material for the store-listing screenshots (AMO and,
 * later, Chrome Web Store): a seeded, realistic-looking world rendered by
 * the real extension in headless Firefox, captured in both themes. The
 * popup is captured as an element shot (to be composited onto a 1280×800
 * canvas); the options page as a full 1280×800 viewport.
 */

const OUT = process.env['SCREENSHOT_OUT'] ?? path.join(process.cwd(), '.screenshots-raw');
const DAY_MS = 86_400_000;

let driver: WebDriver;

function save(name: string, base64: string): void {
  writeFileSync(path.join(OUT, name), base64, 'base64');
}

async function setTheme(theme: 'dark' | 'light'): Promise<void> {
  await inExtensionPage(
    driver,
    `const stored = await browser.storage.local.get('settings');
     await browser.storage.local.set({ settings: { ...(stored.settings ?? {}), theme: '${theme}' } });
     return true;`,
  );
}

/** Popup at 1.5× so text stays legible when composited onto 1280×800. */
async function popupShot(name: string): Promise<void> {
  // Element screenshots clip to the viewport — make sure the whole zoomed
  // popup fits (the default headless window is too short).
  await driver.manage().window().setRect({ x: 0, y: 0, width: 1000, height: 1400 });
  await driver.get(extensionPage('popup/popup.html'));
  await scanAndWait(driver);
  await driver.executeScript(`document.body.style.zoom = '1.5';`);
  const body = await driver.findElement(By.css('body'));
  save(name, await body.takeScreenshot());
}

/** Options page as an exact 1280×800 viewport shot. */
async function optionsShot(name: string): Promise<void> {
  await driver.get(extensionPage('options/options.html'));
  await driver.executeScript(`document.body.style.zoom = '1.25'; window.scrollTo(0, 0);`);
  await driver.manage().window().setRect({ x: 0, y: 0, width: 1280, height: 800 });
  const [innerW, innerH] = (await driver.executeScript(
    'return [window.innerWidth, window.innerHeight];',
  )) as [number, number];
  // Compensate for window chrome so the viewport is exactly 1280×800.
  if (innerW !== 1280 || innerH !== 800) {
    await driver
      .manage()
      .window()
      .setRect({ x: 0, y: 0, width: 1280 + (1280 - innerW), height: 800 + (800 - innerH) });
  }
  save(name, await driver.takeScreenshot());
}

beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  driver = await launchWithExtension();
  await driver.get(extensionPage('popup/popup.html'));

  // A believable browsing world under the default thresholds (cookies 90 d,
  // history 180 d): fresh sites that survive, stale ones that don't, a
  // container + a partitioned cookie for the badges, and a never-visited
  // tracker cookie for the "no visit recorded" section.
  await inExtensionPage(
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
           name: 'session' + i,
           value: 'x',
           secure: true,
           expirationDate: inAYear,
         });
       }
     };
     await addSite('wikipedia.org', 1, 4, 2);
     await addSite('github.com', 3, 3, 2);
     await addSite('stackoverflow.com', 120, 3, 4);
     await addSite('archive.org', 300, 4, 3);
     await addSite('wordpress.com', 250, 3, 3);
     await browser.cookies.set({
       url: 'https://gravatar.com/',
       name: 'embed', value: 'x', secure: true, expirationDate: inAYear,
       partitionKey: { topLevelSite: 'https://wordpress.com' },
     });
     const container = await browser.contextualIdentities.create({
       name: 'Shopping', color: 'pink', icon: 'cart',
     });
     await browser.cookies.set({
       url: 'https://archive.org/',
       name: 'cart', value: 'x', secure: true, expirationDate: inAYear,
       storeId: container.cookieStoreId,
     });
     await browser.cookies.set({
       url: 'https://doubleclick.net/',
       name: 'id', value: 'x', secure: true, expirationDate: inAYear,
     });
     // Populate the options page: a couple of protected sites and a
     // plausible action-log history.
     const stored = await browser.storage.local.get('settings');
     await browser.storage.local.set({
       settings: { ...(stored.settings ?? {}), whitelist: ['github.com'] },
       actionLog: [
         {
           at: now - 9 * DAY,
           type: 'global-clear',
           dataTypes: ['cache'],
         },
         {
           at: now - 2 * DAY,
           type: 'delete-history',
           deleted: [{ domain: 'archive.org', count: 4 }],
         },
         {
           at: now - 2 * DAY,
           type: 'delete-cookies',
           deleted: [
             { domain: 'archive.org', storeId: 'firefox-default', count: 3 },
             { domain: 'stackoverflow.com', storeId: 'firefox-default', count: 4 },
           ],
         },
       ],
     });
     return true;`,
  );
});

afterAll(async () => {
  await driver?.quit();
});

describe('store screenshots', () => {
  it('captures the dark theme (default)', async () => {
    await popupShot('popup-dark.png');
    await optionsShot('options-dark.png');
  });

  it('captures the light theme', async () => {
    await setTheme('light');
    await popupShot('popup-light.png');
    await optionsShot('options-light.png');
  });
});
