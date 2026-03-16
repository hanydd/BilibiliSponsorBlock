## Cursor Cloud specific instructions

This is a Chromium browser extension (BilibiliSponsorBlock / 小电视空降助手) that skips sponsor segments on Bilibili videos. It is a single-product npm repo (not a monorepo).

### Quick reference

| Task | Command |
|------|---------|
| Install deps | `npm ci` |
| Lint | `npm run lint` |
| Build (dev, Chrome) | `npm run build:dev` |
| Build (dev, Firefox) | `npm run build:dev:firefox` |
| Build (prod) | `npm run build` |
| Unit tests (no build) | `npm run test-without-building` |
| Unit tests (with build) | `npm run test` |
| Dev mode (Chrome + watch) | `npm run dev` |

### Non-obvious caveats

- `config.json` must exist before building. Copy from `config.json.example`. If you get `CompileConfig` or `property does not exist on type ConfigClass` errors, delete `config.json` and re-copy from the example.
- `npm run test` runs a full Chrome build first, then Jest. Use `npm run test-without-building` to skip the build step when you already have a `dist/` directory.
- The `dist/` directory is the unpacked extension. Load it in Chrome via `chrome://extensions` → Developer mode → "Load unpacked".
- To launch Chrome with the extension from the command line: `google-chrome --no-sandbox --disable-gpu --load-extension=/workspace/dist --start-url="https://www.bilibili.com"`.
- The extension communicates with an external backend API (`https://www.bsbsb.top`). No local backend is needed for standard development/testing.
- Unit tests cover URL parsing, BV/AV ID conversion, and danmaku utilities. They do not require network or browser access.
