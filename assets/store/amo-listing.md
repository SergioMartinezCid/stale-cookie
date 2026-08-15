# AMO listing copy

Paste-ready text for the addons.mozilla.org listing. The Spanish block goes
under the listing's es-ES locale (Manage Listing → Localize). Keep this file
in sync with README/PRIVACY if features or retention bounds change.

## English (en-US)

### Summary (max 250 chars)

Cleans up cookies, history and downloads from sites you no longer visit — with a preview before anything is deleted, a protected-sites list, and undo. No network requests, ever: everything stays in your browser.

### Description

Stale Cookie deletes stale browsing data — data belonging to sites you haven't visited in a long time — while preserving everything from the sites you actually use.

<b>What it does</b>

<ul>
<li><b>Scan with preview.</b> Finds cookies, browsing history and (optionally) download history from sites you haven't visited in a configurable number of days (90 days for cookies and downloads, 180 for history by default), grouped one row per site. Nothing is deleted without you seeing the list first.</li>
<li><b>Protected sites.</b> An explicit list that no scan or clean ever touches.</li>
<li><b>Undo.</b> Deleted cookies can be restored for 24 hours while the browser stays open. (History and downloads are unrecoverable by nature — the confirmation says so before you delete.)</li>
<li><b>Automatic cleaning (opt-in).</b> A scheduled clean of exactly what a manual preview would pre-select, recorded in the action log.</li>
<li><b>Reminders.</b> A toolbar badge — and, optionally, a system notification — when it's time to clean.</li>
<li><b>Action log.</b> A local record of what was deleted, kept for 30 days, exportable with an anonymize option for bug reports.</li>
<li><b>Firefox extras.</b> Container cookies and partitioned (CHIPS) cookies are handled and labeled in the preview.</li>
<li>Dark and light themes. English and Spanish.</li>
</ul>

<b>Privacy</b>

No network requests, ever. No telemetry, no analytics. Everything the extension needs is stored locally in your browser and never leaves it. The extension runs no content scripts — it never reads or touches web pages. Full policy: https://github.com/SergioMartinezCid/stale-cookie/blob/main/PRIVACY.md

<b>Known limitations</b>

<ul>
<li>Firefox only exposes the current session's downloads to extensions, so older download entries can't be listed or deleted per site.</li>
<li>Cache and saved form data can only be cleared globally (the browser offers no per-site API) — that lives in a separate action with its own explicit confirmation.</li>
<li>Desktop only; sites are matched by registrable domain (visiting mail.google.com keeps google.com data fresh).</li>
</ul>

Open source (MIT): https://github.com/SergioMartinezCid/stale-cookie

## Spanish (es-ES)

### Resumen (máx. 250 caracteres)

Limpia cookies, historial y descargas de los sitios que ya no visitas, con vista previa antes de eliminar nada, lista de sitios protegidos y deshacer. Sin conexiones de red, nunca: todo se queda en tu navegador.

### Descripción

Stale Cookie elimina los datos de navegación obsoletos — los que pertenecen a sitios que llevas mucho tiempo sin visitar — y conserva todo lo de los sitios que sí usas.

<b>Qué hace</b>

<ul>
<li><b>Análisis con vista previa.</b> Encuentra cookies, historial de navegación y (opcionalmente) historial de descargas de sitios que no has visitado en un número configurable de días (por defecto, 90 días para cookies y descargas, 180 para el historial), agrupados en una fila por sitio. No se elimina nada sin que veas antes la lista.</li>
<li><b>Sitios protegidos.</b> Una lista explícita que ningún análisis ni limpieza toca jamás.</li>
<li><b>Deshacer.</b> Las cookies eliminadas pueden restaurarse durante 24 horas mientras el navegador siga abierto. (El historial y las descargas son irrecuperables por naturaleza — la confirmación lo avisa antes de eliminar.)</li>
<li><b>Limpieza automática (opcional).</b> Una limpieza programada de exactamente lo que una vista previa manual preseleccionaría, registrada en el registro de acciones.</li>
<li><b>Recordatorios.</b> Una insignia en la barra de herramientas — y, opcionalmente, una notificación del sistema — cuando toca limpiar.</li>
<li><b>Registro de acciones.</b> Un registro local de lo eliminado, conservado 30 días, exportable con opción de anonimizar para informes de errores.</li>
<li><b>Extras de Firefox.</b> Las cookies de contenedores y las cookies particionadas (CHIPS) se gestionan y etiquetan en la vista previa.</li>
<li>Temas claro y oscuro. Español e inglés.</li>
</ul>

<b>Privacidad</b>

Sin conexiones de red, nunca. Sin telemetría ni analítica. Todo lo que la extensión necesita se guarda localmente en tu navegador y nunca sale de él. La extensión no ejecuta scripts de contenido: nunca lee ni toca las páginas web. Política completa: https://github.com/SergioMartinezCid/stale-cookie/blob/main/PRIVACY.md

<b>Limitaciones conocidas</b>

<ul>
<li>Firefox solo expone a las extensiones las descargas de la sesión actual, así que las entradas de descargas antiguas no pueden listarse ni eliminarse por sitio.</li>
<li>La caché y los datos de formularios solo pueden borrarse globalmente (el navegador no ofrece una API por sitio): esa acción vive aparte, con su propia confirmación explícita.</li>
<li>Solo escritorio; los sitios se emparejan por dominio registrable (visitar mail.google.com mantiene frescos los datos de google.com).</li>
</ul>

Código abierto (MIT): https://github.com/SergioMartinezCid/stale-cookie

## Listing settings (reference)

- Category: Privacy & Security. Tags: cookies, privacy, history, cleaner.
- Support URL: https://github.com/SergioMartinezCid/stale-cookie/issues
- Privacy-policy field: paste PRIVACY.md.
- Icon: assets/store/listing-icon-512.png. Screenshots: assets/store/screenshots/ (popup dark first).
- Firefox for Android availability: OFF. Channel: listed. Experimental: unchecked.
