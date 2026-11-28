# Settings page

`settings/index.html` (with `style.css`, local Bootstrap, and the `copy` / `pencil` / `spinner` / `trash` SVGs) is a single static page with inline JS and no build step. It reads and writes `homey.settings` directly (`Homey.get`/`set`/`unset`). For the keys it writes, see [data-model.md](data-model.md). Strings come from `locales/*.json` via `data-i18n` and `Homey.__()`.

The page keeps its own in-memory caches (`cachedDashboards`, `cachedDashboard`, `cachedImages`, `cachedImage`, `cachedVariables`) for its lifetime. It doesn't listen for changes made by flows while it's open.

## Tabs

| Tab | Content |
|---|---|
| Dashboards | List with edit, copy and delete per dashboard, plus "add". |
| Variables | List with the rendered sample, edit and delete, plus "add". |
| Images | List with the image, rename and delete, plus a multi-file upload (`.jpg`, `.jpeg`, `.png`). |

An empty Images or Variables tab shows the `emptyError` message instead of the table.

## Dashboard editor (`manage-dashboard`)

- A name, plus column/row pickers limited to the valid layouts (8×4, 5×3, 4×2, 3×2). Changing one picker moves the other to the nearest valid value. New dashboards start at 5×3.
- A grid of keys labelled `A1`, `A2`… (`deckDefaultText`). Each key is a `role="button"` that also opens with Enter or Space. Clicking a key opens the item editor, with three parts: **Display** (None, Variable or Image, with a chosen image/variable; the `displayMode` string, which wraps onto more lines on a narrow screen), an optional **Action** (the key's navigation, `settings.dashboard.item.navigation.*`) and a free-text **payload**. The key's flows always run; the action is *None* (the default, value `none`), *Open dashboard* (a picker with every other dashboard, sorted by name, and *Return after*: a choice of *Stays open*, 10 s, 30 s, 1, 2 or 5 min, plus the key's own value when it's another one) or *Back*. While the dashboard is being edited, a key keeps its navigation in `data-navigation-type` / `-dashboard-id` / `-timeout` (`readNavigation` / `writeNavigation`). `showNavigationLabel` shows it as a strip at the bottom of the key (`→ Lights`, `← Back`; the arrows flip in a right-to-left layout), also on the item editor's preview, and puts the same in the key's `aria-label`. An *Open dashboard* whose target was deleted shows *Choose a dashboard…*, and Save stays disabled until one is picked; without other dashboards the picker is replaced by the `noDashboards` hint.
- Save builds `items` from the grid (`item` is the 1-based position, `navigation` from `readNavigation`), escapes the quotes in payloads, and writes `dashboards` + `dashboard-<id>`.
- Names are made unique by appending `-1`, `-2`… (`validateName`). An empty dashboard name becomes `dashboard`.
- Names are stored as typed (image names come from file names) and are always written to the page with `textContent`, never `innerHTML`. `settings.test.mts` checks this.

## Images

Each uploaded file is read as a data URL, center-cropped to a square, scaled down to at most 250 px, re-encoded as JPEG at 0.8 quality, and stored as `image-<uuid>`. Its name is the file name without the extension, made unique.

## Variables

The editor has a name, first and second line, and text and background colours. The preview (`sample`) is rendered on the Homey through `POST /textToImage` and cached per combination of text and colours.

## Consistency on load

`loadImages()` / `loadVariables()` first remove every dashboard item that points to a missing image or variable, and re-save that dashboard. `loadDashboards()` migrates old `displayMode` dashboards to `columns`/`rows`.

## Web API (`api.mts`)

| Route | Body | Returns |
|---|---|---|
| `POST /textToImage` | `{ firstLine, secondLine?, textColor?, backgroundColor? }` | A JPEG data URL rendered by `TextToImage` at 192 px. An empty `secondLine` means one line. The colours default to `#ffffff` on `#000000`. |
