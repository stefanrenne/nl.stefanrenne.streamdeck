# TODO

Status: `[ ]` open · `[~]` in progress · `[?]` needs a decision or verification

When an item is done, move it to [COMPLETED.md](COMPLETED.md) with its context (root cause, gotchas, how it was verified). Items marked with a test have an `it.todo(...)` in `test/`: turn it into a real test when fixing.

## Bugs

- [?] **The Release workflow needs the `RELEASE_TOKEN` secret.** The bot's own `GITHUB_TOKEN` may not push past the `develop` ruleset, and GitHub Actions can't be added to the bypass list of a personal repo (only installed apps are listed). The workflow now pushes with `RELEASE_TOKEN`, a fine-grained personal access token of the repo owner (only this repo; Contents: read and write), whose admin role bypasses the ruleset. The owner creates it and adds it under Settings → Secrets and variables → Actions. Then run Release once (1.2.1: patch, with the changelog of the draft release) and move this item to COMPLETED.md. The token expires: renew it when a release fails on authentication.

## Cleanup

None open.

## Features

- [?] **Try the virtual Stream Deck on a real Homey** (branch `feature/virtual-deck`). It is built from the SDK docs and tested with mocks and a mocked widget page in a browser, but never ran on a Homey. Check: pairing offers the five models, each with its own grid icon and a name that fits on the tile, and lets you pick only one; the widget's device autocomplete lists them; the widget draws the dashboard and the Homey logo and follows dashboard switches, variable updates, brightness and on/off live (`homey.api.realtime` reaching the widget); presses fire the button triggers, including single/double; the widget's height follows its width; changing the model setting redraws the widget. Then move this item to COMPLETED.md.
- [ ] **Virtual deck: use the widget's native `devices` setting** instead of the `device` autocomplete, once it's clear how an app finds its device by the Homey device id that `Homey.getDeviceIds()` returns (see docs/virtual-deck.md).
