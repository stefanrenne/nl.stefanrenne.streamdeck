# Data model

All user data lives in **`homey.settings`** (the app settings store). The settings page writes it directly with `Homey.set` / `Homey.unset`. The app reads it through `Store` in `lib/storage.mts`.

## Settings keys

| Key | Written by | Value |
|---|---|---|
| `dashboards` | settings page | `[{ id, name }]`, the list of dashboards (ids are `crypto.randomUUID()`) |
| `dashboard-<id>` | settings page, `Store.updateDashboard` | `{ columns, rows, items: StoredDashboardItem[] }` |
| `images` | settings page | `[{ id, name }]` |
| `image-<id>` | settings page | JPEG data URL (`data:image/jpeg;base64,…`), center-cropped to a square of at most 250 px |
| `variables` | settings page | `[{ id, name, …}]`. The settings page stores the **whole** variable here (including `sample`); `Store` only reads `id` and `name`. |
| `variable-<id>` | settings page, `Store.setVariable` (flow cards) | `{ firstLine, secondLine, textColor, backgroundColor, sample }` |

`StoredDashboardItem` is `{ type: 'empty' | 'image' | 'variable', item, imageId?, variableId?, payload }`:

- `item` is the **1-based key position**, in row-major order (`index + 1` of the deck's `CONTROLS`). Key names in the UI and the `item` token are a row letter plus a column number: item 1 is `A1`, and item 8 on a 5-column deck is `B3`.
- `payload` is free text. The settings page escapes `"` as `\x22` and `'` as `\x27`, and `Store.getDashboard` unescapes them.
- `columns` / `rows` are one of 8×4, 5×3, 4×2, 3×2. The settings page stores them as **strings** (`"5"`), because they are read from `innerHTML`. `Store.updateDashboard` writes numbers. `NetworkDock.loadDashboard` compares with `!=`, so both work.
- Dashboards from before 1.1.6 had `displayMode` (6/8/15/32) instead of `columns`/`rows`. The settings page migrates them when it loads. If it hasn't, the device writes the deck's size on the next load.

`cleanSettings()` (run from `StreamDeckApp.onInit`) removes every key that isn't `dashboards` / `images` / `variables` or referenced from one of those lists.

## Store

`Store` is a read-through cache: `getDashboard`, `getImage` and `getVariable` read settings on the first call and then serve from memory until they're invalidated.

- `getDashboard(id)` resolves each item into a `DashboardItem`: `{ kind: 'image', imageBuffer, … }`, `{ kind: 'variable', firstLine, secondLine, textColor, backgroundColor, … }` or `{ kind: 'empty', payload }`. An item whose image or variable no longer exists becomes `empty` but keeps its payload. `items` always has keys 1–32, defaulting to empty. `usedVariableIds` lists the variables shown on it.
- `getVariable(id)` defaults the colours to `#ffffff` on `#000000` and maps an empty `secondLine` to `undefined`. `setVariable` stores `undefined` as `''`.
- `getImage(id)` decodes the data URL into `imageBuffer`.
- The `…Metadata` lists are cached separately and are re-read when a cache is invalidated or empty.

**Each `Store` instance has its own cache.** The app has one, and every `NetworkDock` device has one. Nothing is shared, so invalidation goes through the settings events below.

## Invalidation chain

```
settings page / Store.setVariable
  └─ homey.settings.set('variable-<id>')                 → 'set' event
       └─ StreamDeckApp.observeSettings
            ├─ app store: invalidateVariable(id)
            └─ homey.settings.emit('set-variable', id)
                 └─ NetworkDock: store.invalidateVariable(id), then redraw the key showing it
```

- `set-dashboard` / `unset-dashboard`: the device invalidates the dashboard, refreshes the `dashboard` capability values, and redraws if it's the selected one. If the selected one was removed, it falls back to the Homey logo.
- `set-image` / `unset-image`: the device only invalidates the image. A dashboard showing it is redrawn when the settings page re-saves the dashboard.
- `invalidateVariable` also drops every cached dashboard whose `usedVariableIds` contains the variable.
- Writes to the lists themselves (`dashboards`, `images`, `variables`) are **not** relayed. Only the per-id keys are.

## Known issues

- `setVariable` deletes `cachedImages[id]` instead of `cachedVariables[id]`. It's harmless today, because the settings relay invalidates the variable right after.
- `updateDashboard` rebuilds the cached dashboard with its **old** `columns`/`rows` (a no-op since 1f5b120). The settings write that follows invalidates it anyway.
- The Homey SDK typings don't say whether `settings.get` returns `undefined` or `null` for a missing key. `getImage` and `getDashboard` only handle `undefined`.
