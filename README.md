# Stale Cookie

Browser extension that clears stale browser data — cookies and other data belonging to sites you no longer visit — while preserving everything from sites you use. Firefox first, Chrome later.

**Status: early development, not yet functional.**

## Privacy

No network requests, ever. No telemetry. Everything the extension needs to work is stored locally in your browser and never leaves it.

## Development

```sh
npm install
npm run build          # bundle into dist/
npm run dev            # rebuild on change
npm test               # unit tests (vitest)
npm run typecheck      # tsc --noEmit
npm run start:firefox  # launch a throwaway Firefox profile with the extension (web-ext)
npm run lint:ext       # web-ext lint against dist/
```

Never test against a real browser profile — deletion is irreversible. `web-ext run` uses a temporary profile.

## License

[MIT](LICENSE)
