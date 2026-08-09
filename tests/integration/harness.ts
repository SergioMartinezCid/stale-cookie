import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser, Builder, By, type WebDriver } from 'selenium-webdriver';
import * as firefox from 'selenium-webdriver/firefox';

/**
 * Integration harness: launches a real headless Firefox with a throwaway
 * profile (geckodriver creates a fresh temporary profile for every session
 * and deletes it on quit — deletion logic never runs against a real
 * profile) and installs dist/ as a temporary add-on.
 *
 * The extension's internal UUID is pinned via the
 * `extensions.webextensions.uuids` pref so tests can navigate straight to
 * moz-extension:// pages. Extension pages are privileged documents, so
 * executeScript there has access to the `browser.*` APIs — that is how
 * tests seed cookies/history (backdated via history.addUrl's visitTime)
 * and verify what a deletion actually removed.
 */

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');

/** Must match browser_specific_settings.gecko.id in the manifest. */
export const GECKO_ID = 'stale-cookie@sergiomartinezcid.github.io';

/** Arbitrary but fixed, so extension page URLs are known in advance. */
export const EXTENSION_UUID = '4b6f2a91-93c9-4f0e-8a5e-0d1e2f3a4b5c';

export function extensionPage(page: string): string {
  return `moz-extension://${EXTENSION_UUID}/${page}`;
}

export async function launchWithExtension(): Promise<WebDriver> {
  if (!existsSync(path.join(DIST, 'manifest.json'))) {
    throw new Error('dist/manifest.json missing — run `npm run build` first (npm run test:integration does).');
  }

  const options = new firefox.Options();
  options.addArguments('-headless');
  // Without system access, Marionette refuses to navigate content tabs to
  // (non-web-accessible) moz-extension:// pages. geckodriver ≥ 0.36 forwards
  // this as Firefox's -remote-allow-system-access.
  const service = new firefox.ServiceBuilder().addArguments('--allow-system-access');
  options.setPreference(
    'extensions.webextensions.uuids',
    JSON.stringify({ [GECKO_ID]: EXTENSION_UUID }),
  );
  // Containers on, so tests can cover per-container cookie stores.
  options.setPreference('privacy.userContext.enabled', true);

  const driver = await new Builder()
    .forBrowser(Browser.FIREFOX)
    .setFirefoxOptions(options)
    .setFirefoxService(service)
    .build();

  try {
    await (driver as firefox.Driver).installAddon(DIST, true);
  } catch (error) {
    await driver.quit();
    throw error;
  }
  return driver;
}

/**
 * Run an async script body inside the current (extension) page, with access
 * to the page's `browser.*` APIs. The body may use `await` and must `return`
 * a JSON-serializable value; rejections surface as test errors.
 */
export async function inExtensionPage<T>(driver: WebDriver, body: string): Promise<T> {
  const result = (await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1];
     (async () => { ${body}\n })().then(
       (value) => done({ ok: true, value: value === undefined ? null : value }),
       (error) => done({ ok: false, error: String((error && error.message) || error) }),
     );`,
  )) as { ok: true; value: T } | { ok: false; error: string };
  if (!result.ok) throw new Error(`extension-page script failed: ${result.error}`);
  return result.value;
}

export interface PreviewRow {
  domain: string;
  checked: boolean;
  badges: string[];
  meta: string;
}

/** Read the rendered rows of one preview list (`stale-list` / `unknown-list`). */
export async function readRows(driver: WebDriver, listId: string): Promise<PreviewRow[]> {
  return (await driver.executeScript(
    `return Array.from(document.querySelectorAll('#' + arguments[0] + ' li')).map((li) => ({
       domain: li.querySelector('.domain').textContent,
       checked: li.querySelector('input[type=checkbox]').checked,
       badges: Array.from(li.querySelectorAll('.badge')).map(
         // First text node only — badges append a visually-hidden span with
         // the tooltip text for screen readers.
         (b) => (b.firstChild ? b.firstChild.textContent : b.textContent),
       ),
       meta: (li.querySelector('.meta') || { textContent: '' }).textContent,
     }));`,
    listId,
  )) as PreviewRow[];
}

/** Click the popup's Scan button and wait for the scan to finish rendering. */
export async function scanAndWait(driver: WebDriver): Promise<void> {
  await driver.findElement(By.id('scan')).click();
  await driver.wait(
    async () =>
      (await driver.findElement(By.id('results')).isDisplayed()) &&
      (await driver.findElement(By.id('scan')).isEnabled()),
    20_000,
    'scan did not finish',
  );
}
