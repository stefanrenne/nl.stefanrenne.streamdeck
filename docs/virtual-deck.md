# Virtual Stream Deck

A Stream Deck that only exists in Homey: a device of the `virtual-deck` driver, shown and pressed in the "Virtual Stream Deck" dashboard widget. It reuses everything the Network Dock does (see [device.md](device.md)): the `onoff` / `dim` / `dashboard` capabilities, the dashboards, the button triggers with their tokens and single/double press detection, and the dashboard cards (its own copies, `virtual_<id>`, see [flow-cards.md](flow-cards.md)). Only the deck is different.

```
widget (public/index.html) ──POST /press──▶ widgets/virtual-deck/api.mts ──▶ VirtualDeck.press
        ▲                    ──GET /state──▶                              ──▶ VirtualDeck.getVirtualState
        │                                                                          │
        └──── homey.api.realtime('virtual-deck', …) ◀── VirtualStreamDeck events ◀─┘
```

## VirtualStreamDeck (`lib/virtualStreamDeck.mts`)

A `DeckSurface` (see [rendering.md](rendering.md)) that keeps its keys in memory, so the adapter draws on it exactly as on a real deck.

- **Models** (`VIRTUAL_DECK_MODELS`): `mini` 3×2 (80 px keys), `neo` 4×2 (96 px), `plus` 4×2 (120 px), `mk2` 5×3 (72 px), `xl` 8×4 (96 px). Only the LCD keys: the Neo's touch keys and info screen and the +'s dials and touch strip are not imitated. `CONTROLS` are LCD buttons laid out row by row, like a real deck's.
- `fillKeyBuffer` encodes the key as a JPEG data URL (quality 90; alpha is dropped, as on a real deck) and emits `key(index, image)`. It accepts `rgba`, `rgb`, `bgra` and `bgr`, and throws for a buffer of the wrong size or a key that doesn't exist. Encoding is async, so each key has a version: a fill only lands if no newer fill or clear of that key started meanwhile.
- `clearKey` / `clearPanel` set keys to `null` (black) and emit `key(index, null)`.
- `calculateFillPanelDimensions` is the key grid without gaps, and `fillPanelBuffer` cuts the panel image into keys. That's how the Homey logo is shown.
- `setBrightness` rounds and clamps to 0–100 and emits `brightness`.
- `press(index, 'down' | 'up')` emits `down` / `up` with the control, like a real deck.
- `getState()`: `{ model, name, columns, rows, keys, brightness }`, everything the widget needs to draw.

## VirtualDeck device and driver (`drivers/virtual-deck/`)

- **Pairing** (`driver.mts`): `list_devices` offers one virtual deck per model, named after the model ("Stream Deck XL", so the part that tells them apart fits on the pairing tile) and with an icon of its key grid (`assets/icons/<model>.svg`; the Neo and + add their touch strip and dials, because both have 4×2 keys). `options.singular` lets the user pick one deck instead of adding every model, which `list_devices` would preselect. Each gets a random `data.id`, so pairing the same model again adds another one.
- **Setting** `model` (dropdown, default `mk2`). Changing it replaces the deck (`attach`) and redraws. An unknown model falls back to `mk2`.
- `onInit` → `StreamDeckDevice.onInit`, then `attach(model)`: creates the deck, forwards its `key` / `brightness` events to the widgets, passes `down` / `up` to `streamDeckEvent` (through `guard`), publishes `state`, and calls `deckDidConnect`. The deck is always connected, so the device is never unavailable.
- Like on a real deck, loading a dashboard whose size differs from the deck stores the deck's size (`Store.updateDashboard`). A dashboard shared by decks of different sizes is resized by each of them.
- `onDeleted` publishes `deleted` and drops the deck.

### Realtime events

The device sends everything on one event, `virtual-deck` (`homey.api.realtime`), with the device's `data.id` as `deviceId`:

| `type` | Fields | When |
|---|---|---|
| `state` | `state` (the `getState()` result) | a deck is attached: on init and when the model changes |
| `key` | `index`, `image` (data URL or `null`) | a key is drawn or cleared |
| `brightness` | `brightness` (0–100) | the brightness changes (`onoff`, `dim`, or on attach) |
| `deleted` | | the device is deleted |

## Widget (`widgets/virtual-deck/`)

- `widget.compose.json`: one setting, `device` (autocomplete). `StreamDeckApp.registerVirtualDeckWidget` lists the virtual decks by name and stores `{ id: data.id, name }`. The widget's native `devices` setting isn't used, because it hands the widget Homey's device id, and the SDK has no documented way to find an app device by that id.
- API (`api.mts`, scoped to the widget): `GET /state?deviceId=` returns `getVirtualState()`, `POST /press` with `{ deviceId, index, action }` calls `press`. Both look the device up by `data.id` among the `virtual-deck` driver's devices and throw `Virtual Stream Deck not found` otherwise.
- `public/index.html`: fetches the state, draws a grid of square keys (`<button>` with an `<img>`) in a black deck frame, and calls `Homey.ready({ height })` with the deck height plus the body padding (Homey's widget stylesheet pads the body; leaving it out made the widget too short, so it scrolled). A `ResizeObserver` on the deck calls `Homey.setHeight` when that height changes, for example when the width changes, because the keys stay square. Brightness is a black overlay with opacity `1 - brightness / 100`.
- Presses: `pointerdown` sends `down`; `pointerup`, `pointercancel` or `lostpointercapture` sends `up`. Requests are queued, so an `up` never overtakes its `down`. Single/double detection happens on Homey, as for a real deck.
- Without a chosen device it shows `widgets.virtualDeck.noDevice`; when the device can't be found or is deleted, `widgets.virtualDeck.notFound`.
- `preview-light.png` / `preview-dark.png` (1024×1024) are screenshots of the widget with a rendered dashboard. The driver images are the same deck on white.

## Known limitations

- Not yet tried on a real Homey: the widget, `homey.api.realtime` to widgets and the `device` autocomplete are built from the SDK docs and checked with a mocked `Homey` object in a browser. See TODO.md.
- Every key change is a separate realtime event with a JPEG of 2–5 KB, so a full redraw of an XL is about 32 events.
