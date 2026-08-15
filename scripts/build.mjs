import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const watch = process.argv.includes('--watch');

/**
 * The JS bundle is shared (Firefox/Chrome differences are gated at runtime);
 * only the manifest differs. dist/ stays the Firefox build — dev workflow and
 * integration tests point at it — and dist-chrome/ is derived from it.
 */
function chromeManifest(manifest) {
  const chrome = structuredClone(manifest);
  // Chrome MV3 requires a service worker; Firefox uses an event page and
  // does not support the service_worker key (and vice versa).
  chrome.background = { service_worker: 'background/index.js' };
  // gecko-only block (id, strict_min_version, data_collection_permissions).
  delete chrome.browser_specific_settings;
  // Firefox-only permission; an unknown permission is a load ERROR on
  // Chrome, not a warning. Containers are a runtime no-op there anyway.
  chrome.permissions = chrome.permissions.filter((p) => p !== 'contextualIdentities');
  // Floor set by theme.css's light-dark() (123); the cookies API's
  // partitionKey filter (119) and storage.session (102) ride below it.
  chrome.minimum_chrome_version = '123';
  return chrome;
}

function emitChromeDist() {
  rmSync('dist-chrome', { recursive: true, force: true });
  cpSync('dist', 'dist-chrome', { recursive: true });
  const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
  writeFileSync('dist-chrome/manifest.json', JSON.stringify(chromeManifest(manifest), null, 2));
}

const options = {
  entryPoints: [
    'src/background/index.ts',
    'src/popup/popup.ts',
    'src/options/options.ts',
  ],
  outdir: 'dist',
  outbase: 'src',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
  plugins: [
    {
      name: 'copy-static',
      setup(build) {
        build.onEnd(() => {
          cpSync('src/manifest.json', 'dist/manifest.json');
          cpSync('src/_locales', 'dist/_locales', { recursive: true });
          cpSync('src/popup/popup.html', 'dist/popup/popup.html');
          cpSync('src/options/options.html', 'dist/options/options.html');
          mkdirSync('dist/ui', { recursive: true });
          cpSync('src/ui/theme.css', 'dist/ui/theme.css');
          cpSync('src/icons', 'dist/icons', { recursive: true });
          // License notices for the bundled deps (esbuild strips their
          // headers); must ship with the extension, not just the repo.
          cpSync('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.md');
          emitChromeDist();
        });
      },
    },
  ],
};

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
