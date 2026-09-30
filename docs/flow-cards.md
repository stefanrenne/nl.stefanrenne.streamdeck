# Flow cards

App-level cards live in `.homeycompose/flow/`. The `onoff` and `dim` capabilities add Homey's standard device cards (turned on/off, brightness, and so on). All button triggers and the dashboard cards take a `device` arg (`driver_id=network-dock`). The code references a card by its `id`, which isn't always the file name (`update_variable_firstLine.json` has id `update_variable_firstline`).

## Triggers (device trigger cards, fired from `NetworkDock`)

| Id | Args | Tokens | Run listener |
|---|---|---|---|
| `any_button_action` | `action` | `dashboard`, `imageName`, `textFirstLine`, `textSecondLine`, `payload`, `column`, `row`, `item` | `args.action === state.action` |
| `image_button_action` | `image` (autocomplete), `action` | `dashboard`, `payload`, `column`, `row`, `item` | same image id and action |
| `variable_button_action` | `variable` (autocomplete), `action` | `dashboard`, `textFirstLine`, `textSecondLine`, `payload`, `column`, `row`, `item` | same variable id and action |
| `off_button_action` | `action` | `column`, `row`, `item` | **none registered**, so the `action` dropdown is ignored: a flow fires on both `down` and `up` (see known issues) |
| `changed_dashboard` | none | `dashboard` (name) | none |

`action` is a dropdown: `down` (pressed), `up` (released), `single`, `double`. When each fires is described in [device.md](device.md#button-events). The device sends the full token set to every trigger, and Homey only exposes the tokens declared in the card's JSON.

## Conditions

| Id | Args | Behaviour |
|---|---|---|
| `is_dashboard` | `dashboard` (autocomplete) | Whether the device's `dashboard` capability equals the chosen id. The title is `!{{is\|is not}}`. |

## Actions

| Id | Args | Behaviour |
|---|---|---|
| `set_dashboard` | `dashboard` (autocomplete) | Switches the device. See [device.md](device.md#dashboards). |
| `update_variable` | `variable`, `firstLine`, `secondLine` | Trims both lines, renders a 192 px sample, and `Store.setVariable` keeps the colours. |
| `update_variable_firstline` | `variable`, `firstLine` | Replaces only the first line. |
| `update_variable_secondline` | `variable`, `secondLine` | Replaces only the second line. An empty value clears it. |

The variable actions are registered in `app.mts`. They do nothing if the variable doesn't exist. The write to `variable-<id>` redraws the key through the settings relay (see [data-model.md](data-model.md#invalidation-chain)).

## Autocomplete (`lib/cardListener.mts`)

- `image` / `variable`: filtered case-insensitively on the name, with the image (or the variable's `sample`) as the preview.
- `dashboard`: `{ id: '0', name: 'Homey' }` first, then every dashboard, filtered on the name.
- The `.sort()` calls in these listeners sort objects and don't change the order: results come back in the order stored in settings.

## Adding a card

1. Add `.homeycompose/flow/<type>/<id>.json` with all 13 languages. Leave out empty `args`/`tokens` arrays, and add `device` (`driver_id=network-dock`) for device cards.
2. Register it: device cards in `NetworkDock.onInit` (use `getDeviceTriggerCard` for triggers), app cards in `StreamDeckApp.onInit`. Use `CardListener` for autocomplete.
3. Add tests (`device.test.mts` or `app.test.mts`), then update this doc and the Flow Cards section of README.md.

## Known issues

- `off_button_action` has an `action` arg, but no run listener. A "Disabled button **released**" flow also fires on press, and vice versa. Single and double never fire while the deck is off, because press detection only runs while it's on.
