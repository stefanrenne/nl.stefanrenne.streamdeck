# Completed

Archive of finished [TODO.md](TODO.md) items and past fixes, newest first. Keep the context: root cause, gotchas, and how it was verified. Commit hashes refer to this repo. For how the app evolved, see [docs/history.md](docs/history.md).

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
