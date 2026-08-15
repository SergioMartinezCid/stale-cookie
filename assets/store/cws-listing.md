# Chrome Web Store listing copy

Paste-ready text for the CWS developer dashboard. CWS descriptions are
PLAIN TEXT (no markdown/HTML) — paste as-is, line breaks are preserved.
The Spanish block goes under the listing's Spanish language entry. Keep in
sync with the AMO listing (`amo-listing.md`) and README/PRIVACY.

Upload package: `web-ext-artifacts/stale-cookie-chrome-1.0.0.zip`
(the zipped contents of `dist-chrome/`, built at tag v1.0.0).

## Store listing tab

- Title/summary come from the manifest (localized automatically).
- Category: Privacy & Security.
- Language: English (default); add Spanish via the language selector.
- Store icon: `assets/store/listing-icon-128.png`.
- Screenshots (1280×800): `assets/store/screenshots/` — popup dark first.
- Small promo tile (440×280): `assets/store/promo-tile-440x280.png`.
- Homepage URL: https://github.com/SergioMartinezCid/stale-cookie
- Support URL: https://github.com/SergioMartinezCid/stale-cookie/issues

### Description (English)

Stale Cookie deletes stale browsing data — data belonging to sites you haven't visited in a long time — while preserving everything from the sites you actually use.

WHAT IT DOES

• Scan with preview: finds cookies, browsing history and (optionally) download history from sites you haven't visited in a configurable number of days (90 days for cookies and downloads, 180 for history by default), grouped one row per site. Nothing is deleted without you seeing the list first.
• Protected sites: an explicit list that no scan or clean ever touches.
• Undo: deleted cookies can be restored for 24 hours while the browser stays open. (History and downloads are unrecoverable by nature — the confirmation says so before you delete.)
• Automatic cleaning (opt-in): a scheduled clean of exactly what a manual preview would pre-select, recorded in the action log.
• Reminders: a toolbar badge — and, optionally, a system notification — when it's time to clean.
• Action log: a local record of what was deleted, kept for 30 days, exportable with an anonymize option for bug reports.
• Dark and light themes. English and Spanish.

PRIVACY

No network requests, ever. No telemetry, no analytics. Everything the extension needs is stored locally in your browser and never leaves it. The extension runs no content scripts — it never reads or touches web pages. Full policy: https://github.com/SergioMartinezCid/stale-cookie/blob/main/PRIVACY.md

KNOWN LIMITATIONS

• Cache and saved form data can only be cleared globally (the browser offers no per-site API) — that lives in a separate action with its own explicit confirmation.
• Sites are matched by registrable domain (visiting mail.google.com keeps google.com data fresh).

Open source (MIT): https://github.com/SergioMartinezCid/stale-cookie

### Descripción (español)

Stale Cookie elimina los datos de navegación obsoletos — los que pertenecen a sitios que llevas mucho tiempo sin visitar — y conserva todo lo de los sitios que sí usas.

QUÉ HACE

• Análisis con vista previa: encuentra cookies, historial de navegación y (opcionalmente) historial de descargas de sitios que no has visitado en un número configurable de días (por defecto, 90 días para cookies y descargas, 180 para el historial), agrupados en una fila por sitio. No se elimina nada sin que veas antes la lista.
• Sitios protegidos: una lista explícita que ningún análisis ni limpieza toca jamás.
• Deshacer: las cookies eliminadas pueden restaurarse durante 24 horas mientras el navegador siga abierto. (El historial y las descargas son irrecuperables por naturaleza — la confirmación lo avisa antes de eliminar.)
• Limpieza automática (opcional): una limpieza programada de exactamente lo que una vista previa manual preseleccionaría, registrada en el registro de acciones.
• Recordatorios: una insignia en la barra de herramientas — y, opcionalmente, una notificación del sistema — cuando toca limpiar.
• Registro de acciones: un registro local de lo eliminado, conservado 30 días, exportable con opción de anonimizar para informes de errores.
• Temas claro y oscuro. Español e inglés.

PRIVACIDAD

Sin conexiones de red, nunca. Sin telemetría ni analítica. Todo lo que la extensión necesita se guarda localmente en tu navegador y nunca sale de él. La extensión no ejecuta scripts de contenido: nunca lee ni toca las páginas web. Política completa: https://github.com/SergioMartinezCid/stale-cookie/blob/main/PRIVACY.md

LIMITACIONES CONOCIDAS

• La caché y los datos de formularios solo pueden borrarse globalmente (el navegador no ofrece una API por sitio): esa acción vive aparte, con su propia confirmación explícita.
• Los sitios se emparejan por dominio registrable (visitar mail.google.com mantiene frescos los datos de google.com).

Código abierto (MIT): https://github.com/SergioMartinezCid/stale-cookie

## Privacy tab

Single purpose (paste):

Removes browsing data (cookies, history, download entries) belonging to sites the user has not visited recently, with a preview before deletion.

Permission justifications (one field per permission):

- cookies: Enumerating and deleting cookies from sites the user has not visited recently is the extension's core function; also used to restore deleted cookies when the user clicks Undo.
- history: The only source of "when did the user last visit this site" — staleness is derived from browser history (the extension keeps no visit records of its own). Also used to delete stale history entries per URL.
- storage: Stores the user's settings, protected-sites list, and a local action log (auto-pruned after 30 days). Session storage holds a memory-only error log and the cookie-undo snapshot.
- alarms: Schedules the cleaning reminder and the opt-in automatic cleaning.
- downloads (optional, requested when the user enables download-history cleaning): Lists and erases stale download-list entries. Never touches files on disk.
- browsingData (optional, requested when the user runs the global clear): Clears the cache and saved form data globally, behind an explicit in-UI confirmation.
- notifications (optional, requested when the user enables the reminder notification): Shows the "time to clean" reminder notification.
- Host permission (<all_urls>): Required by the cookies API to enumerate and delete cookies for arbitrary domains the user has visited. The extension registers no content scripts and never reads or modifies web pages; there is no narrower host pattern that covers every site a user may have data from.

Remote code: No — all JavaScript is bundled into the package at build time (esbuild); no CDN scripts, no eval of fetched code.

Data usage: does NOT collect or transmit ANY user data — check no categories. All processing is local; the extension makes no network requests (certify the disclosures).

## Distribution

- Visibility: Public. Regions: all.
- One-time $5 developer registration fee + 2FA on the Google account.
