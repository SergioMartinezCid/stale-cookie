import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser, Builder, By, type WebDriver } from 'selenium-webdriver';
import * as chromium from 'selenium-webdriver/chrome';
import * as firefox from 'selenium-webdriver/firefox';

/**
 * Integration harness: launches a real headless browser with a throwaway
 * profile (both drivers create a fresh temporary profile per session and
 * delete it on quit — deletion logic never runs against a real profile)
 * and installs the built extension: dist/ as a Firefox temporary add-on,
 * dist-chrome/ via --load-extension on Chrome for Testing.
 *
 * On Firefox the extension's internal UUID is pinned via the
 * `extensions.webextensions.uuids` pref so tests can navigate straight to
 * moz-extension:// pages; on Chrome the generated id is discovered from
 * the service worker's DevTools target. Extension pages are privileged
 * documents, so executeScript there has access to the extension APIs —
 * that is how tests seed cookies/history and verify what a deletion
 * actually removed.
 */

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');
const DIST_CHROME = path.join(ROOT, 'dist-chrome');

// Snap-packaged Firefox cannot read profiles under /tmp (snap confinement
// bit us 2026-08-13 after the snap auto-updated: "Failed to read marionette
// port"). geckodriver honors TMPDIR for its throwaway profiles, so they land
// under the repo instead; geckodriver still deletes each profile on quit.
const PROFILE_TMP = path.join(ROOT, '.tmp-profiles');
mkdirSync(PROFILE_TMP, { recursive: true });
process.env['TMPDIR'] = PROFILE_TMP;

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
  // Point the suite at a specific Firefox build (e.g. an ESR tarball to
  // verify strict_min_version) instead of the system one.
  const firefoxBin = process.env['FIREFOX_BIN'];
  if (firefoxBin) options.setBinary(firefoxBin);
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

/** Launch headless Chrome for Testing with dist-chrome/ loaded unpacked. */
export async function launchChromeWithExtension(): Promise<{
  driver: WebDriver;
  extensionId: string;
}> {
  if (!existsSync(path.join(DIST_CHROME, 'manifest.json'))) {
    throw new Error(
      'dist-chrome/manifest.json missing — run `npm run build` first (npm run test:integration does).',
    );
  }

  const options = new chromium.Options();
  // --headless=new is the unified headless that supports extensions and
  // service workers. --load-extension was removed from branded Chrome in
  // 137 but kept in Chrome for Testing — so the suite must never run
  // against a system Chrome. Requesting an explicit browserVersion makes
  // Selenium Manager provision (and cache) Chrome for Testing even when a
  // branded Chrome is installed, as on CI runners.
  // --disable-dev-shm-usage: /dev/shm is tiny under WSL/containers.
  options.setBrowserVersion('stable');
  options.addArguments(
    '--headless=new',
    `--load-extension=${DIST_CHROME}`,
    '--disable-dev-shm-usage',
  );

  const driver = await new Builder().forBrowser(Browser.CHROME).setChromeOptions(options).build();
  try {
    return { driver, extensionId: await discoverExtensionId(driver) };
  } catch (error) {
    await driver.quit();
    throw error;
  }
}

/**
 * An unpacked extension's id is derived from its absolute path; rather than
 * reimplement that hash, read it off the background service worker's
 * DevTools target once it registers.
 */
async function discoverExtensionId(driver: WebDriver): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = (await (driver as chromium.Driver).sendAndGetDevToolsCommand(
      'Target.getTargets',
      {},
    )) as unknown as { targetInfos: Array<{ url: string }> };
    const target = result.targetInfos.find((t) => t.url.startsWith('chrome-extension://'));
    if (target) return new URL(target.url).host;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('extension service worker target never appeared');
}

export function chromeExtensionPage(extensionId: string, page: string): string {
  return `chrome-extension://${extensionId}/${page}`;
}

/**
 * Run an async script body inside the current (extension) page, with access
 * to the page's `browser.*` APIs. The body may use `await` and must `return`
 * a JSON-serializable value; rejections surface as test errors.
 */
export async function inExtensionPage<T>(driver: WebDriver, body: string): Promise<T> {
  const result = (await driver.executeAsyncScript(
    // On Firefox extension pages `browser` is a native global; Chrome only
    // has `chrome`, whose MV3 APIs are promise-based too — one shim serves
    // both, so seeding/verification scripts are written against browser.*.
    `const browser = globalThis.browser ?? globalThis.chrome;
     const done = arguments[arguments.length - 1];
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
