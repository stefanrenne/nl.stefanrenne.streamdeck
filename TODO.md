# TODO

Status: `[ ]` open · `[~]` in progress · `[?]` needs a decision or verification

When an item is done, move it to [COMPLETED.md](COMPLETED.md) with its context (root cause, gotchas, how it was verified). Items marked with a test have an `it.todo(...)` in `test/`: turn it into a real test when fixing.

## Bugs

- [ ] **`onoff` writes 0/100 to `dim`.** The `onoff` capability listener in `drivers/network-dock/device.mts` does `setCapabilityValue('dim', value ? 100 : 0)`, but `dim` ranges from 0 to 1, so turning the deck on sets an out-of-range brightness. It should set `1`/`0`. Test: `device.test.mts` "onoff sets dim to 1 or 0".
- [ ] **"Disabled button" flows ignore the chosen action.** `off_button_action` has an `action` dropdown, but no run listener is registered (`CardListener.registerAnyButtonRunListener` would do), so a flow fires on both press and release. Test: `device.test.mts` "off_button_action only fires flows for the chosen action".
- [ ] **Stream Deck Neo is measured as 4×3.** In `lib/streamDeckAdapter.mts`, `getButtonControlSize` uses `if (control as StreamDeckButtonControlDefinitionLcdFeedback)` as if it were a type check. It's a cast, so the Neo's 2 RGB touch keys and LCD segment (row 2) count too. The device settings show 3 rows, `Store.updateDashboard(4, 3)` is rejected on every load, and `renderDashboard` / `getDisplayedControlForVariable` also iterate over the non-LCD controls. Filter on `type === 'button' && feedbackType === 'lcd'` in all three. Test: `rendering.test.mts` "ignores non-LCD controls".
- [?] **`homey.settings.get` for a missing key: `undefined` or `null`?** `Store.getImage` / `getDashboard` / `getVariable` only handle `undefined`. If the runtime returns `null`, a dashboard that points to a deleted image crashes on `.replace`. Verify on a Homey. Comparing with `== null` would handle both either way.
- [?] **An ip address change from discovery doesn't reconnect.** `onDiscoveryAddressChanged` only calls `setSettings({ ipAddress })`, and `onSettings` isn't called for programmatic changes. Check on a Homey whether `onDiscoveryAvailable` follows with the new address. Otherwise, reconnect in `onDiscoveryAddressChanged`.
- [ ] **Settings page renders names as HTML.** Image, variable and dashboard names are written with `innerHTML` (`loadImages`, `loadVariables`, `loadDashboards`), and image names come from file names. Use `textContent`.

## Cleanup

- [ ] `Store.setVariable` deletes `cachedImages[id]`, which should be `cachedVariables[id]` (harmless today, because the settings relay invalidates it).
- [ ] `Store.updateDashboard` rebuilds the cached dashboard with its old `columns`/`rows`. This became a no-op in `1f5b120`. Set the new values, or just invalidate.
- [ ] The `.sort()` calls in `lib/cardListener.mts` sort objects and don't change the order. Sort by `name`, or remove them.
- [ ] `renderPincodeDashboard` in `lib/streamDeckAdapter.mts` is unused and broken (inverted early return, divides by `rows` where it means `columns`). Finish it or delete it.
- [ ] Single/double press detection uses the global `setTimeout`. Use `this.homey.setTimeout`, so it is cleared when the app unloads.
- [ ] The settings page stores `columns`/`rows` as strings, and the full variable (including its base64 `sample`) in the `variables` list. Store numbers and `{ id, name }` only (keep reading the old format).

## Docs / store listing

- [?] **README.txt is a feature list.** `README.txt` and its 12 translations list features, Flow cards, configuration and requirements. App Store Guidelines 1.3 reject that kind of description (see CLAUDE.md). Shorten all 13 to the core pitch plus a GitHub pointer when the next release is prepared.
