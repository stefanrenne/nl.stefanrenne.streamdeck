# History

Why the code looks the way it does. Details of individual fixes are in [COMPLETED.md](../COMPLETED.md).

## 0.x – 1.0 (Jan – Feb 2026): images and dashboards

- The app started as a proof of concept (0.0.1, 2026-01-19): a Network Dock device with `onoff`, press/release triggers, and "buttons" (renamed to **images** in `ad0c139`) created in the settings page.
- Dashboards came next: created in the settings page (`65d8402`), switched from Flows (`5e1733d`, `d9685a0`), and with a "Homey" default dashboard (`ec7db59`). Dashboards could be copied, and buttons got a free-text **payload** (`355019a`), whose quote escaping dates from then.
- Dashboard items used to be an array searched by `item`. `070638b` changed them to an object keyed by position (`items[index + 1]`), which is the shape `Store` still produces.
- Settings used to accumulate dead keys, so `cleanSettings` runs on every start (`576e210`).
- 1.0.0 was released on 2026-02-17.

## 1.1.x (Feb – Aug 2026): variables, press types, more decks

- **Variables** (1.1.0): text keys rendered with `TextToImage`, managed in their own settings tab, and updated from Flows. Invalidating the app's own variable cache in the settings relay, and `invalidateVariable` → dashboard invalidation, came with the 1.1.1 fixes (`8ed034f`).
- **Single/double press** (1.1.2, `9424ed9`) added to the `action` dropdown.
- 1.1.4: text and background colours for variables, reacting to ip address changes (the discovery hooks, `73d7d9d`), and an upgrade of the stream-deck library.
- 1.1.5 (`00a1032`) added **Stream Deck Neo** (8-key) support and moved all drawing into `lib/streamDeckAdapter.ts`.
- 1.1.6 (`1f5b120`): a UI overhaul. The dashboard size changed from a `displayMode` key count (6/8/15/32) to `columns`/`rows`, with a migration in the settings page.
- 1.1.7: the button triggers gained the `item` token (`A1`, `B3`, …, `6aa335b`), plus dependency updates.
- 1.1.8 (`45dfc87`): moved from CommonJS `.ts` to ESM `.mts` with a flat `eslint.config.mjs`. The move broke `__dirname` (the Homey logo), which was fixed in 1.1.9.
- 1.1.8 / 1.1.9: crash fixes for serial/firmware read timeouts (`2a23812`) and the Homey logo path (`345f453`).
