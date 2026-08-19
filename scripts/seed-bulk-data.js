/**
 * Bulk-seed the dev profile with ~10,000 very old items for stress testing
 * the popup (long-list scrolling, deletion speed, "Deleting…" feedback).
 *
 * Not part of the build. Paste the whole file into the extension's console:
 * about:debugging#/runtime/this-firefox → Stale Cookie → Inspect → Console.
 * Uses only fake bulk-*.example domains — no network requests are made, and
 * deleting through the extension afterwards only removes this seeded data.
 *
 * What it seeds: 1,800 domains × 5 history entries (9,000) + a cookie on
 * every second domain (900) ≈ 9,900 items in 1,800 preview rows, with
 * visit times spread 200–900 days ago — all stale under default settings.
 * The bulk deliberately leans on history: Firefox silently evicts cookies
 * past its global/per-host caps, so mass cookies would quietly vanish.
 * Takes roughly a minute; progress is logged every 200 domains.
 */
(async () => {
  const DAY = 86_400_000;
  const now = Date.now();
  const inAYear = Math.floor(now / 1000) + 365 * 86_400;

  const DOMAINS = 1_800;
  const URLS_PER_DOMAIN = 5;
  const COOKIE_EVERY = 2;
  const CONCURRENCY = 20;

  const seedDomain = async (d) => {
    const domain = `bulk-${String(d).padStart(4, '0')}.example`;
    // Deterministic spread over 200–900 days ago — very old, but varied
    // enough that "last visit" dates differ row to row.
    const daysAgo = 200 + ((d * 7919) % 700);
    for (let i = 0; i < URLS_PER_DOMAIN; i++) {
      await browser.history.addUrl({
        url: `https://${domain}/page-${i}`,
        title: `${domain} page ${i}`,
        visitTime: now - daysAgo * DAY - i * 60_000,
      });
    }
    if (d % COOKIE_EVERY === 0) {
      await browser.cookies.set({
        url: `https://${domain}/`,
        name: 'bulk',
        value: 'x',
        secure: true,
        expirationDate: inAYear,
      });
    }
  };

  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < DOMAINS) {
      await seedDomain(next++);
      if (++done % 200 === 0) console.log(`seeded ${done}/${DOMAINS} domains…`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  console.log(
    `Done: ${DOMAINS} domains — ${DOMAINS * URLS_PER_DOMAIN} history entries + ` +
      `${Math.ceil(DOMAINS / COOKIE_EVERY)} cookies, all 200–900 days old. ` +
      'Open the popup and scan.',
  );
})();
