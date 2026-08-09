import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');

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
