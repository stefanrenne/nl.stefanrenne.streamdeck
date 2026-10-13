# Completed

Archive of finished [TODO.md](TODO.md) items and past fixes, newest first. Keep the context: root cause, gotchas, and how it was verified. Commit hashes refer to this repo. For how the app evolved, see [docs/history.md](docs/history.md).

## 2026-10-13

- **Removed `renderPincodeDashboard`.** An unfinished pincode keypad from `00a1032`, never called. Its early return was inverted (it returned for every deck that could fit a 3×3 keypad) and it divided by `rows` where it meant `columns`. Deleted rather than finished; it's in git history if a keypad is ever wanted.
- **Autocomplete wasn't sorted.** `cardListener.mts` called `.sort()` without a compare function on arrays of objects, which leaves the order unchanged, so images, variables and dashboards came back in settings order. They are now sorted by name, case-insensitively, with "Homey" still first for dashboards. The dashboard metadata is copied before sorting, so the `Store` cache isn't reordered. Test: `cardListener.test.mts` "lists images, variables and dashboards by name, with Homey first".
- **`Store.setVariable` cleared the wrong cache** (since `355019a`). It deleted `cachedImages[id]` instead of the variable. Harmless in practice, because the settings relay invalidates right after, but the writing `Store` read stale text until then. It now calls `invalidateVariable(id)` (which also drops cached dashboards that show it). Test: `storage.test.mts` "setVariable drops the cached variable… (regression 355019a)".
- **`Store.updateDashboard` kept the old size in its cache** (since `1f5b120`). It rebuilt the cached dashboard with the old `columns`/`rows`. It now invalidates the dashboard after writing. Test: `storage.test.mts` "updateDashboard also updates a cached dashboard (regression 1f5b120)".
- **`Store` crashed if `settings.get` returns `null` for a missing key** (since `355019a`). `getImage`, `getDashboard` and `updateDashboard` only checked for `undefined`, so a `null` would crash on `.replace` / `.items`, for example for a dashboard that points to a deleted image. They now use `== null`, which handles both. Whether the runtime returns `null` or `undefined` is still not verified on a Homey, and it no longer matters. Tests: `storage.test.mts` "when homey.settings.get returns null for a missing key (regression 355019a)".
- **Settings page rendered names as HTML** (since `f36cfe8`). `loadImages`, `loadVariables` (list and the variable picker) and `loadDashboards` wrote names with `innerHTML`. Names are stored unescaped and image names come from file names, so markup in a name was rendered (and could run script in the settings page). All four now use `textContent`. The other `innerHTML` uses on the page only write fixed strings, translations or key labels. Test: new `settings.test.mts` "writes user-provided names as text, not HTML (regression f36cfe8)", a source check because the page has no DOM tests.
- **Stream Deck Neo was measured as 4×3** (since `00a1032`). `getButtonControlSize`, `renderDashboard`, `renderPincodeDashboard` and the device's `getDisplayedControlForVariable` used `control as StreamDeckButtonControlDefinitionLcdFeedback` as if it were a type check. It's only a cast, so the Neo's 2 RGB touch keys and LCD segment (row 3) counted too: the device stored 3 rows, every dashboard load called `Store.updateDashboard(4, 3)`, and rendering tried to draw on the non-LCD controls. A new `getLcdButtonControls` filters on `type === 'button' && feedbackType === 'lcd'` and is used in all four places. Not verified on a real Neo. Tests: `rendering.test.mts` "ignores non-LCD controls, so a Stream Deck Neo is 4x2 (regression 00a1032)" and "only draws on the LCD keys of a Stream Deck Neo", `device.test.mts` "Stream Deck Neo (regression 00a1032)". The device test helper `connect()` now waits for the LCD keys only.
- **"Disabled button" flows ignored the chosen action** (since `cdf1426`). `off_button_action` has an `action` dropdown, but no run listener was registered, so every flow fired on both press and release. The device now registers `CardListener.registerAnyButtonRunListener` for it. Single/double still never fire while off (see TODO.md). Test: `device.test.mts` "off_button_action only fires flows for the chosen action (regression cdf1426)".
- **Stream Deck libraries pinned back to 7.7.1.** After the Dependabot bumps to 7.8.0 (`a9698f4`, `3213ada`), the device stopped connecting under `homey app run`: discovery matched and `onDiscoveryAvailable` called `connectTo`, but no `connected` or `error` followed. Two runs on 7.8.0 hung, and a run on 7.7.1 connected the dock and the Stream Deck 32 Module within a second. A probe script on the macOS host connected with both versions, so the problem is specific to Linux/Docker. Pinned to `~7.7.1`, Dependabot ignores `>=7.8.0`, and `manifest.test.mts` "keeps @elgato-stream-deck on 7.7.x" guards it. The root cause is still open in TODO.md. Discovery and init logging was added to find this.
- **Brightness wasn't sent to the deck on connect.** `setBrightness` was only called from the `onoff`/`dim` listeners, so after pairing (`onAdded` uses `setCapabilityValue`, which doesn't run listeners), a reconnect or a power cycle, Homey showed 100% while the deck kept its own brightness. The `connected` handler now sends the current value. `dim * 100` is also rounded, because the deck truncates fractions (0.29 → 28). Found by the user on a real deck. Tests: `device.test.mts` "applies the stored brightness when the deck connects", "applies brightness 0 on connect when the deck is turned off", "rounds dim to a whole percentage".
- **`onoff` wrote 0/100 to `dim`** (since `a95f9c8`). The `onoff` listener used one value for both `setBrightness` (0–100) and the `dim` capability (0–1), so turning the deck on set `dim` to 100. It now sets `dim` to `1`/`0` and passes `dim * 100` to the deck. Test: `device.test.mts` "onoff sets dim to 1 or 0 (regression a95f9c8)".
- **Unused `homey-api` dependency.** Listed in `dependencies` but never imported (the app uses the SDK's `this.homey`). It pulled in `socket.io-client` → `engine.io-client` → `parseuri` (GHSA-6fx8-h7jm-663j, moderate ReDoS). Removed in `df5f5f0`; `npm audit` is clean.

## 2026-09-30

- **`package.json` version drift.** `package.json` and the root of `package-lock.json` said `1.0.0` while the app was `1.1.9`. The release workflow only bumps `.homeycompose/app.json` / `app.json`. Synced by hand to `1.1.9`, and `release.yml` now runs `npm version <x> --no-git-tag-version` after the bump. `test/manifest.test.mts` checks that the versions match.
- **Unused `nl` locale key.** `locales/nl.json` had `settings.dashboard.item.manage.name`, which no other locale and no code used. Removed it, and `test/manifest.test.mts` now checks that the locale keys match.
- **Config files in the app bundle.** Because of `allowJs`, `tsc` compiled `eslint.config.mjs` into `.homeybuild`, and the Homey CLI also copied it. `tsconfig.json` now excludes it (along with `test/` and `vitest.config.mjs`), and `.homeyignore` lists it. Verified with `homey app build` and `ls .homeybuild`.

## 1.1.9 (2026-08-04)

- **Homey logo dashboard crashed** (`345f453`). `renderHomeyLogo` resolved `assets/homey-logo.png` with `__dirname`, which doesn't exist in ESM after the `.mts` migration (`45dfc87`). Fix: `path.dirname(fileURLToPath(import.meta.url))`. Any other file path in `lib/` has to do the same. Test: `rendering.test.mts` "fills the whole panel with the logo".

## 1.1.8 (2026-08-04)

- **Timeout reading serial/firmware crashed the app** (`2a23812`). `streamDeckDidConnect` awaited `getSerialNumber()` / `getFirmwareVersion()` inline, and those TCP feature reports can time out on an otherwise healthy dock. Both are now read in parallel with a `.catch` that logs, and are only written to the settings when they were read. Test: `device.test.mts` "tolerates failing serial / firmware reads".
- **ESM migration** (`45dfc87`). Moved `.ts` → `.mts`, `module.exports` → `export default`, `.eslintrc.json` → flat `eslint.config.mjs`. The `__dirname` break above came from this.

## 1.1.7 (2026-07)

- **minimatch vulnerability** (`11c0b50`). Pinned `minimatch ^9.0.7` under `@typescript-eslint/typescript-estree` through `overrides` in `package.json`. That override is still there; remove it once `npm audit` stays clean without it.
- **`item` token** (`6aa335b`). The button triggers gained `item` (row letter + column, for example `B3`), matching the key labels in the settings page.

## 1.1.6 (2026-05)

- **Dashboard size as columns/rows** (`1f5b120`). `displayMode` (a key count) became `columns`/`rows`, and the settings page migrates old dashboards on load. Side effect: the cache update in `Store.updateDashboard` became a no-op (see TODO.md).

## 1.1.5 (2026-04-20)

- **Stream Deck Neo support** (`00a1032`). Allowed 8-key (4×2) dashboards and moved the drawing code into `lib/streamDeckAdapter`. The Neo's non-LCD controls are still counted (see TODO.md).

## 1.1.4 (2026-03-09)

- **Reacting to ip address changes** (`73d7d9d`). The device no longer connects in `onInit`. Instead it connects in `onDiscoveryAvailable`, stores address changes from `onDiscoveryAddressChanged`, and reconnects in `onSettings` when the user edits `ipAddress`.

## 1.1.1 (2026-03-01)

- **Variable updates didn't show** (`8ed034f`). The app's relay re-emitted `set-variable`, but didn't invalidate its own `Store`, so the next flow update read stale lines. Cached dashboards also kept the old text. Fix: the relay calls `invalidateVariable`, and dashboards record `usedVariableIds` so `invalidateVariable` drops them. Tests: `app.test.mts` "a later update sees the previous one", and `storage.test.mts` "invalidateVariable also drops cached dashboards".

## 1.0.x (2026-02)

- **1.0.2: invalid enum capability crash** (`8862c09`). On init the device set the `dashboard` value before refreshing the capability's options, so Homey rejected a value that wasn't in the (still empty) enum. Fix: `updateSelectableDashboardOptions()` runs before `validateSelectedDashboardOption()`. Test: `device.test.mts` "falls back to the Homey dashboard … after setting the options".
- **1.0.3: image upload** (`8da5b88`). The file input wasn't reset after uploading, so selecting the same file again didn't fire `change`.
- **Image rename didn't work** (`b46d9d2`). The rename handler passed `item.id` instead of the image's `id`, and `updateImage` used `newValue` instead of its own parameter.
- **Dead settings keys** (`576e210`). Deleting a dashboard or image could leave `dashboard-<id>` / `image-<id>` behind. `cleanSettings()` runs on every app start and removes unreferenced keys.
- **Dashboard items by position** (`070638b`). Items were looked up with `items.find(item => item.item === index + 1)`. They are now an object keyed by position with 32 empty defaults, so a missing entry never yields `undefined`.
