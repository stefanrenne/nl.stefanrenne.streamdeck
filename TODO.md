# TODO

Status: `[ ]` open · `[~]` in progress · `[?]` needs a decision or verification

When an item is done, move it to [COMPLETED.md](COMPLETED.md) with its context (root cause, gotchas, how it was verified). Items marked with a test have an `it.todo(...)` in `test/`: turn it into a real test when fixing.

## Bugs

- [?] **`homey.settings.get` for a missing key: `undefined` or `null`?** `Store.getImage` / `getDashboard` / `getVariable` only handle `undefined`. If the runtime returns `null`, a dashboard that points to a deleted image crashes on `.replace`. Verify on a Homey. Comparing with `== null` would handle both either way.
- [?] **An ip address change from discovery doesn't reconnect.** `onDiscoveryAddressChanged` only calls `setSettings({ ipAddress })`, and `onSettings` isn't called for programmatic changes. Check on a Homey whether `onDiscoveryAvailable` follows with the new address. Otherwise, reconnect in `onDiscoveryAddressChanged`.
- [ ] **Settings page renders names as HTML.** Image, variable and dashboard names are written with `innerHTML` (`loadImages`, `loadVariables`, `loadDashboards`), and image names come from file names. Use `textContent`.

- [ ] **`@elgato-stream-deck/*` 7.8.0 doesn't connect on Homey.** With 7.8.0, `connectTo` never results in `connected` (not even for the dock itself) and no `error` is emitted when the app runs in Docker (`homey app run`, and so on a Homey). 7.7.1 connects within a second in the same setup. On the macOS host, both versions connect. Pinned to `~7.7.1` (package.json, Dependabot ignore, `manifest.test.mts`). Find the cause (suspects: the keepalive/timeout rework in `socketWrapper.js`, `TcpCoraHidDevice.#disconnected`), report it upstream at [node-elgato-stream-deck](https://github.com/Julusian/node-elgato-stream-deck), and lift the pin once a fixed version is verified with `homey app run`. Note: plain `docker run` containers on the dev Mac get `ECONNREFUSED` from the dock with either version, so they can't be used to reproduce this.

- [?] **Single/double press never fire while the deck is off.** `off_button_action` offers single and double press in its dropdown, but `streamDeckEvent` returns before `validateSingleDouble` when `onoff` is false, and `validateSingleDouble` always passes `isTurnedOn = true`. Decide: run press detection while off (and pass the real `onoff`), or remove single/double from that card's dropdown (all 13 languages).

## Cleanup

- [ ] `Store.setVariable` deletes `cachedImages[id]`, which should be `cachedVariables[id]` (harmless today, because the settings relay invalidates it).
- [ ] `Store.updateDashboard` rebuilds the cached dashboard with its old `columns`/`rows`. This became a no-op in `1f5b120`. Set the new values, or just invalidate.
- [ ] The `.sort()` calls in `lib/cardListener.mts` sort objects and don't change the order. Sort by `name`, or remove them.
- [ ] `renderPincodeDashboard` in `lib/streamDeckAdapter.mts` is unused and broken (inverted early return, divides by `rows` where it means `columns`). Finish it or delete it.
- [ ] Single/double press detection uses the global `setTimeout`. Use `this.homey.setTimeout`, so it is cleared when the app unloads.
- [ ] The settings page stores `columns`/`rows` as strings, and the full variable (including its base64 `sample`) in the `variables` list. Store numbers and `{ id, name }` only (keep reading the old format).

## Docs / store listing

- [?] **README.txt is a feature list.** `README.txt` and its 12 translations list features, Flow cards, configuration and requirements. App Store Guidelines 1.3 reject that kind of description (see CLAUDE.md). Shorten all 13 to the core pitch plus a GitHub pointer when the next release is prepared.
