/**
 * Seed the dev profile with test data for manual testing.
 *
 * Not part of the build. Paste the whole file into the extension's console:
 * about:debugging#/runtime/this-firefox → Stale Cookie → Inspect → Console.
 * Uses only fake .example domains — no network requests are made.
 *
 * With default settings (cookies 90 d / history 180 d) a scan should show:
 *  - fresh-shop.example      visited 5 d ago   → fresh (summary line only)
 *  - stale-forum.example     visited 120 d ago → STALE row, but only its
 *    cookies are deletable (history at 120 d is still under 180 d) —
 *    deleting the row must remove cookies and keep the history
 *  - ancient-news.example    visited 300 d ago → STALE row: cookies +
 *    5 history entries + a partitioned cookie (widget-cdn.example) +
 *    a container cookie (badges for both)
 *  - old-bank.example        visited 400 d ago → STALE; use Protect on it
 *    to test the whitelist
 *  - ghost-tracker.example   cookies, no visit → "No visit recorded",
 *    preselected (mixed scan)
 * Downloads can't be backdated via the API — download any small file for a
 * fresh session entry instead.
 */
(async () => {
  const DAY = 86_400_000;
  const now = Date.now();
  const inAYear = Math.floor(now / 1000) + 365 * 86_400;

  const addSite = async (domain, daysAgo, urls = 2, cookies = 2) => {
    for (let i = 0; i < urls; i++) {
      await browser.history.addUrl({
        url: `https://${domain}/page-${i}`,
        title: `${domain} page ${i}`,
        visitTime: now - daysAgo * DAY - i * 60_000,
      });
    }
    for (let i = 0; i < cookies; i++) {
      await browser.cookies.set({
        url: `https://${domain}/`,
        name: `seed${i}`,
        value: 'x',
        secure: true,
        expirationDate: inAYear,
      });
    }
  };

  await addSite('fresh-shop.example', 5);
  await addSite('stale-forum.example', 120);
  await addSite('ancient-news.example', 300, 5, 3);
  await addSite('old-bank.example', 400);

  // Cookies with no visit at all → "No visit recorded".
  await browser.cookies.set({
    url: 'https://ghost-tracker.example/',
    name: 'ghost',
    value: 'x',
    secure: true,
    expirationDate: inAYear,
  });

  // Partitioned cookie → must appear in ancient-news.example's row.
  try {
    await browser.cookies.set({
      url: 'https://widget-cdn.example/',
      name: 'partitioned-seed',
      value: 'x',
      secure: true,
      expirationDate: inAYear,
      partitionKey: { topLevelSite: 'https://ancient-news.example' },
    });
  } catch (e) {
    console.warn('partitioned cookie failed:', e.message);
  }

  // Container cookie → container badge on ancient-news.example's row.
  try {
    await browser.cookies.set({
      url: 'https://ancient-news.example/',
      name: 'container-seed',
      value: 'x',
      secure: true,
      expirationDate: inAYear,
      storeId: 'firefox-container-2',
    });
  } catch (e) {
    console.warn('container cookie failed (containers not initialized?):', e.message);
  }

  console.log('Seeded. Open the popup and scan.');
})();
