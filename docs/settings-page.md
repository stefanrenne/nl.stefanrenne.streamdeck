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
- A grid of keys labelled `A1`, `A2`… (`deckDefaultText`). Clicking a key opens the item editor, where the key can be None, Variable or Image, with a chosen image/variable and a free-text **payload**.
- Save builds `items` from the grid (`item` is the 1-based position), escapes the quotes in payloads, and writes `dashboards` + `dashboard-<id>`.
- Names are made unique by appending `-1`, `-2`… (`validateName`). An empty dashboard name becomes `dashboard`.

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

## Known issues

- Names of images, variables and dashboards are written with `innerHTML`. Image names come from file names, so HTML in a name is rendered.
- `columns`/`rows` are saved as strings (see [data-model.md](data-model.md)).
- The `variables` list stores every variable's full data, including its base64 `sample`, next to `variable-<id>`.
