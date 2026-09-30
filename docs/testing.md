# Testing

Unit tests use [Vitest](https://vitest.dev) and live in `test/`. Run them with `npm test`, which first type-checks `test/` with `test/tsconfig.json` and then runs `vitest run`. The CI (`ci.yml`), PR (`pr.yml`) and `release.yml` workflows run `npm run lint` and `npm test` before validating or publishing.

## Setup

| File | Purpose |
|---|---|
| `vitest.config.mjs` | Aliases `homey` to `test/mocks/homey.mts`, includes `test/**/*.test.mts`, and sets a 20 s timeout because jimp font loading is slow on a cold start. |
| `test/mocks/homey.mts` | Stand-in for the `homey` runtime module: `App`, `Driver` (with settable `discoveryResults`) and `Device` (in-memory capability values, options and listeners, settings, availability). A capability that was never set reads as `null`, as on Homey. |
| `test/helpers/fake-homey.mts` | `createFakeHomey()` returns a fake `homey` with the real generated `app.json` manifest, `FakeCard`s (they record run and autocomplete listeners and have a `trigger` spy), and `FakeSettings`. `FakeSettings` is an in-memory `homey.settings` that emits `set`/`unset`; its `seed()` writes without emitting, and unknown keys read as `undefined`. `seedSettings()` writes dashboards, images and variables in the settings page's format. `RED_PIXEL_PNG` is a valid image data URL. |
| `test/helpers/fake-stream-deck.mts` | `FakeStreamDeck`, with spies for every deck call (`fillKeyBuffer`, `clearKey`, `fillPanelBuffer`, `setBrightness`, …) and `tcpEvents`. `lcdButtons(columns, rows)` builds a real control layout, and `neoControls()` builds the Neo's. |
| `test/tsconfig.json` | Type-checks the tests (`noEmit`, `rootDir: ".."`). The root `tsconfig.json` excludes `test/` and the `*.config.mjs` files (it has `allowJs`), so they never reach `.homeybuild`. |
| `.homeyignore` | Keeps `test/`, `vitest.config.mjs` and `eslint.config.mjs` out of the uploaded app. |

`device.test.mts` replaces `@elgato-stream-deck/tcp` with `vi.mock`, using a `StreamDeckTcpConnectionManager` that is an EventEmitter with `connectTo`/`disconnectFrom` spies. A test connects a deck by emitting `connected` with a `FakeStreamDeck`. `connect()` then waits until every key (or the whole panel) has been drawn.

## Test files

| File | Covers |
|---|---|
| `storage.test.mts` | `Store`: resolving dashboard items, unescaping payloads, the image/variable defaults, caching and invalidation (including variable → dashboard), `updateDashboard` layouts, `cleanSettings`. |
| `cardListener.test.mts` | Autocomplete for images, variables and dashboards (including the Homey entry), and the run-listener matching. |
| `rendering.test.mts` | `TextToImage` (size, background, text colour, `#rgb`), `getButtonControlSize`, `renderDashboard` (which keys are drawn or cleared, error tolerance), `renderHomeyLogo`. |
| `device.test.mts` | `NetworkDock`: init and dashboard fallback, connecting (settings, rendering, failing serial reads, no deck, disconnect), button events and tokens, single/double timing (fake timers), dashboard cards and the capability, the settings events, brightness, discovery/ip changes, delete. |
| `app.test.mts` | `StreamDeckApp` (cleanup on init, the settings relay, the three update-variable actions), `api.textToImage`, `NetworkDockDriver.onPairListDevices`. |
| `manifest.test.mts` | All compose files (flow, capability, driver, app) are translated into all 13 languages. Flow cards have no empty `args`/`tokens`. `app.json` matches `.homeycompose`. Locales have matching keys, and every README exists. Versions match, and the changelog has the current version. |

## Conventions

- **Known bugs** are written as `it.todo('…')`, next to a test that documents the current behaviour where that's useful. Both point to `TODO.md`. When you fix one, turn the todo into a real test and delete the other test.
- **Waiting:** device handlers are async event listeners, so wait for their effect with `vi.waitFor(...)` instead of fixed sleeps.
- **Timers:** only the single/double tests use `vi.useFakeTimers()`, and only after connecting, because jimp needs real timers.
- **Translations:** `homey.__` returns the key.
- **Regressions:** name regression tests after the fixing commit, `(regression <hash>)`, and record the fix in `COMPLETED.md`.
