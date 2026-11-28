# Testing

Unit tests use [Vitest](https://vitest.dev) and live in `test/`. Run them with `npm test`, which first type-checks `test/` with `test/tsconfig.json` and then runs `vitest run`. The CI (`ci.yml`), PR (`pr.yml`) and `release.yml` workflows run `npm run lint` and `npm test` before validating or publishing.

## Setup

| File | Purpose |
|---|---|
| `vitest.config.mjs` | Aliases `homey` to `test/mocks/homey.mts`, includes `test/**/*.test.mts`, and sets a 20 s timeout because jimp font loading is slow on a cold start. |
| `test/mocks/homey.mts` | Stand-in for the `homey` runtime module: `App`, `Driver` (with settable `discoveryResults`) and `Device` (in-memory capability values, options and listeners, settings, store values, name, availability). A capability or store value that was never set reads as `null`, as on Homey. |
| `test/helpers/fake-homey.mts` | `createFakeHomey()` returns a fake `homey` with the real generated `app.json` manifest, `FakeCard`s (they record run and autocomplete listeners and have a `trigger` spy), and `FakeSettings`. `FakeSettings` is an in-memory `homey.settings` that emits `set`/`unset`; its `seed()` writes without emitting, and unknown keys read as `undefined`. `api.realtime` is a spy, `drivers.getDriver(id).getDevices()` returns the devices a test pushes with `driverDevices(id)`, and `dashboards.getWidget(id)` is a `FakeWidget` that records setting autocomplete listeners. `homey.setTimeout`/`clearTimeout` are spies that call the global timers at call time, so `vi.useFakeTimers()` controls them. `seedSettings()` writes dashboards, images and variables in the settings page's format. `RED_PIXEL_PNG` is a valid image data URL. |
| `test/helpers/fake-stream-deck.mts` | `FakeStreamDeck`, with spies for every deck call (`fillKeyBuffer`, `clearKey`, `fillPanelBuffer`, `setBrightness`, …) and `tcpEvents`. `lcdButtons(columns, rows)` builds a real control layout, and `neoControls()` builds the Neo's. |
| `test/tsconfig.json` | Type-checks the tests (`noEmit`, `rootDir: ".."`). The root `tsconfig.json` excludes `test/` and the `*.config.mjs` files (it has `allowJs`), so they never reach `.homeybuild`. |
| `.homeyignore` | Keeps `test/`, `vitest.config.mjs` and `eslint.config.mjs` out of the uploaded app. |

`device.test.mts` replaces `@elgato-stream-deck/tcp` with `vi.mock`, using a `StreamDeckTcpConnectionManager` that is an EventEmitter with `connectTo`/`disconnectFrom` spies. A test connects a deck by emitting `connected` with a `FakeStreamDeck`. `connect()` then waits until every key (or the whole panel) has been drawn.

## Test files

| File | Covers |
|---|---|
| `storage.test.mts` | `Store`: resolving dashboard items and their navigation, unescaping payloads, missing keys read as `null`, the image/variable defaults, caching and invalidation (including variable → dashboard), `updateDashboard` layouts, `cleanSettings`. |
| `cardListener.test.mts` | Autocomplete for images, variables and dashboards (including the Homey entry), and the run-listener matching. |
| `rendering.test.mts` | `TextToImage` (size, background, text colour, `#rgb`), `getButtonControlSize`, `renderDashboard` (which keys are drawn or cleared, only LCD keys on a Neo, error tolerance), `renderHomeyLogo`. |
| `device.test.mts` | `NetworkDock`: init and dashboard fallback, connecting (settings, rendering, failing serial reads, no deck, disconnect, growing but never shrinking a dashboard, a larger dashboard on a smaller deck by row and column, two decks of different sizes on one dashboard), button events and tokens, single/double timing (fake timers), dashboard cards and the capability, navigation keys (open/back, timeout, history, the device store, events after a navigating press), the settings events, brightness, discovery/ip changes, delete. |
| `virtualDeck.test.mts` | `VirtualStreamDeck` (layout per model, filling and clearing keys, pixel formats, a clear overtaking a fill, cutting a panel, brightness, presses), the `VirtualDeck` device (attaching, brightness, presses firing the same triggers as a real deck, single press, a navigation key with the widget's later single, variable redraws, changing the model, delete), the widget `api`, and `VirtualDeckDriver.onPairListDevices`. |
| `app.test.mts` | `StreamDeckApp` (cleanup on init, the virtual deck widget's device autocomplete, the settings relay, the three update-variable actions), `api.textToImage`, `NetworkDockDriver.onPairListDevices`. |
| `settings.test.mts` | The settings page (`settings/index.html`) has no build step or DOM tests, so this checks its source: names are never written with `innerHTML`, dashboard sizes are stored as numbers, the `variables` list only gets `{ id, name }`, and each key's navigation is saved in the format `Store` reads. |
| `manifest.test.mts` | All compose files (flow, capability, driver, app) are translated into all 13 languages. Flow cards have no empty `args`/`tokens`. `app.json` matches `.homeycompose`. Every device card in `app.json` is for exactly one driver, the device card templates have no `device` arg, the Network Dock keeps the original card ids and the virtual deck has them all as `virtual_<id>`; the virtual deck's model setting matches its models, and the widget has its page, previews and API. Locales have matching keys, and every README exists. Every `README*.txt` is a short pitch (at most 4 paragraphs, no lists, ends with the GitHub link). Versions match, and the changelog has the current version. Every `zod` and `minimatch` in `package-lock.json` is a patched version (the `overrides` in `package.json`). |

## Conventions

- **Known bugs** are written as `it.todo('…')`, next to a test that documents the current behaviour where that's useful. Both point to `TODO.md`. When you fix one, turn the todo into a real test and delete the other test.
- **Waiting:** device handlers are async event listeners, so wait for their effect with `vi.waitFor(...)` instead of fixed sleeps.
- **Timers:** only the single/double tests use `vi.useFakeTimers()`, and only after connecting, because jimp needs real timers.
- **Translations:** `homey.__` returns the key.
- **Regressions:** name regression tests after the fixing commit, `(regression <hash>)`, and record the fix in `COMPLETED.md`.
