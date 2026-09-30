# Network Dock driver and device

`drivers/network-dock/` has one driver, class `button`, with the capabilities `onoff`, `dim` and the custom enum `dashboard` (`.homeycompose/capabilities/dashboard.json`, a picker whose values are set at runtime).

## Discovery and pairing

- `.homeycompose/discovery/network-dock.json`: mDNS-SD `_elg._tcp`, matching `txt.md` against `.*Network Dock.*`. The discovery id is `txt.md`.
- `driver.mts` `onPairListDevices` lists every discovery result as `{ name: id, data: { id }, settings: { ipAddress: address } }`. Pairing uses the standard `list_devices` → `add_devices` templates.
- Device settings (`driver.settings.compose.json`): `ipAddress` (editable), plus the read-only labels `name`, `serial`, `firmware`, `columns` and `rows`, which are filled in on connect.

## Connection lifecycle

| Event | What happens |
|---|---|
| `onDiscoveryAvailable` | `connectionManager.connectTo(getSetting('ipAddress'))` |
| `onDiscoveryAddressChanged` | stores the new address in the `ipAddress` setting |
| `onSettings` with a changed `ipAddress` | clears the panel, `disconnectFrom(old)`, `connectTo(new)` |
| manager `connected` with controls | keeps the deck, `setAvailable`, subscribes to `down`/`up`/`error`/`disconnected`, writes the `name`/`columns`/`rows` settings (and `serial`/`firmware` if they can be read), then loads the selected dashboard |
| manager `connected` without controls | `setUnavailable('No Stream Deck connected to Network Dock')` if no deck was connected yet |
| manager `error` / deck `error` | `setUnavailable(message)` |
| deck `disconnected` | `setUnavailable('Stream Deck Disconnected')`, drops the deck |
| `onDeleted` | clears the panel and disconnects from the deck's address |

Serial and firmware are read over TCP feature reports that can time out. Their failures are logged and ignored (fix 2a23812), and must never reject the connect handler.

## Dashboards

- The `dashboard` capability's values are `0` ("Homey", which shows the Homey logo full-panel) plus every dashboard (`updateSelectableDashboardOptions`). They are refreshed on init and on every `set-`/`unset-dashboard`.
- On init, if the selected dashboard no longer exists, the device switches to `0` and triggers `changed_dashboard`. The options **must** be set before the value, otherwise Homey rejects the enum value (fix 8862c09, 1.0.2).
- `loadDashboard(id)`: `0` or an unknown id draws the Homey logo. Otherwise it draws the dashboard, and if the deck's grid differs from the stored `columns`/`rows`, it stores the deck's size (`Store.updateDashboard`).
- Switching: the capability listener (from the device UI) and the `set_dashboard` action both load the dashboard and trigger `changed_dashboard` with its name. `set_dashboard` throws `'Stream Deck is unavailable'` while the device is unavailable, and does nothing if the dashboard is already selected.

## Button events

Deck `down`/`up` events for controls of type `button` go to `streamDeckEvent(event, onoff, control)`:

- Tokens: `dashboard` (name), `imageName`, `textFirstLine`, `textSecondLine`, `payload`, `column` and `row` (1-based), and `item` (row letter + column number, for example `B3`). State: `{ action, imageId, variableId }`, which the run listeners match against (see [flow-cards.md](flow-cards.md)).
- If `onoff` is false, only `off_button_action` fires (for any key, on any dashboard).
- If no dashboard is loaded (the Homey logo), nothing fires.
- Otherwise `image_button_action` or `variable_button_action` fires for that item kind, and `any_button_action` always fires, including for empty keys.

### Single and double press

On `down`, `validateSingleDouble` runs before the `down` triggers:

- A second `down` on the **same key within 250 ms** fires `double` immediately, and suppresses the pending single.
- Otherwise a `single` fires **400 ms** after the press, unless a double happened in between. A press on another key doesn't cancel it.

This uses the global `setTimeout`, not `homey.setTimeout`.

## Brightness

- `dim` (0–1): `setBrightness(value * 100)`, and `onoff = value > 0`.
- `onoff`: `setBrightness(100 | 0)`, and **writes 100 or 0 to `dim`** (see known issues).
- `onAdded` sets `dim = 1` and `onoff = true`.

## Known issues

- The `onoff` listener sets `dim` to `100`/`0`, but `dim` ranges from 0 to 1.
- `getButtonControlSize` uses `control as StreamDeckButtonControlDefinitionLcdFeedback` as if it were a type check. It's a cast, so every control counts, and a Stream Deck Neo (8 LCD keys plus 2 RGB touch keys and an LCD segment on row 3) is measured as 4×3. `renderDashboard` also tries to draw on the non-LCD controls, and those errors are logged.
- After `onDiscoveryAddressChanged`, the device doesn't reconnect by itself: `setSettings` doesn't call `onSettings`, so it relies on the next `onDiscoveryAvailable`.
