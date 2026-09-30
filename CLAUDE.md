# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Homey (Athom smart-home hub) SDK v3 app `nl.stefanrenne.streamdeck`: it turns an Elgato Stream Deck, connected through a **Stream Deck Network Dock** on the LAN, into a Homey controller. Users build dashboards of image and text ("variable") buttons in the app settings page. Button presses fire Flow triggers, and Flows can switch dashboards or update variable text. TypeScript as ES modules (`.mts`, imported with `.mjs` extensions), Node 22, `platforms: ["local"]`. It uses `@elgato-stream-deck/tcp` for the dock connection and `jimp` for rendering images.

## Commands

```bash
npm run build      # tsc → .homeybuild/
npm run lint       # eslint on **/*.mts (including test/)
npm test           # type-check test/ + vitest run
npm run test:watch # vitest in watch mode
npx vitest run test/device.test.mts             # one file
npx vitest run -t "single and double"           # tests whose name matches
homey app validate --level verified   # what CI runs, after lint and test (requires Homey CLI)
homey app run      # run on a Homey for development (requires Homey CLI and a Network Dock)
```

## Tests are required

**Every feature and every bug fix must come with new unit tests, or extend the existing ones, in the same change.** A change is not done until `npm test` and `npm run lint` pass. For a bug fix, add a test that fails without the fix and name it with the regression commit, for example `(regression 2a23812)`, as the existing ones are. When you fix a bug that has an `it.todo(...)`, replace the todo with a real test and delete the test that documents the old behaviour. Put tests in the file that matches the layer you changed (`storage`, `cardListener`, `rendering` for `textToImage`/`streamDeckAdapter`, `device`, `app` for the app/api/driver, `manifest` for compose/locale/release files). Only change existing assertions when the behaviour change is intended, and say so in the commit. See [docs/testing.md](docs/testing.md) for how the suite is set up.

## Outstanding work

**`TODO.md` (repo root) is the single source of truth for what's left to do.** Check it at the start of each session. It lists every outstanding bug, cleanup and feature, with status markers. Finished items are archived with their full context (root causes, gotchas, verification notes) in `COMPLETED.md`. Check there before re-investigating anything that sounds familiar.

When you find a bug or loose end that you're not fixing right now, add it to `TODO.md`. When you finish an item, move it to `COMPLETED.md` in the same change. The "Known issues" sections in `docs/` describe current behaviour; `TODO.md` tracks the fix. Update both.

## Reference docs

Detailed reference lives in `docs/`. Read the relevant file before changing that area:

- [docs/data-model.md](docs/data-model.md): the `homey.settings` keys (dashboards, images, variables), the `Store` caches, and the invalidation chain from a settings write to a redrawn key.
- [docs/device.md](docs/device.md): the Network Dock driver and device: discovery and pairing, the connection lifecycle, capabilities, button events and single/double press detection, and dashboard switching.
- [docs/rendering.md](docs/rendering.md): `streamDeckAdapter` and `TextToImage`: how dashboards, variables and the Homey logo are drawn on the keys.
- [docs/flow-cards.md](docs/flow-cards.md): every trigger, condition and action card, with args, tokens and run-listener matching.
- [docs/settings-page.md](docs/settings-page.md): the settings page (dashboard editor, images, variables), what it writes, and the `/textToImage` API.
- [docs/testing.md](docs/testing.md): the test setup (vitest, the fake Homey and Stream Deck), what each test file covers, and how to add tests.
- [docs/history.md](docs/history.md): how the app evolved and why some things look the way they do.

**Every change must update `docs/`.** In the same change as the code, update the affected `docs/*.md`. If the change introduces an area that no existing file covers, create a new `docs/<topic>.md` and add it to the list above. Docs describe current behaviour, not history (history goes in `.homeychangelog.json`). A change is not done until the docs match the code.

## User-facing docs: keep them in sync with feature changes

The files below describe the app to end users. They **must be updated whenever a user-visible feature changes**, for example a new flow card or token, a new setting, a newly supported Stream Deck model, new UI in the settings page, or changed behaviour:

- `README.md` is the full GitHub-facing doc: features, the Flow cards and their tokens, configuration screenshots (`md/`), and supported hardware. `docs/` is the developer reference; README.md is the user-facing explanation.
- `README.txt` is the Homey App Store description, and `README.{ar,da,de,es,fr,it,ko,nl,no,pl,ru,sv}.txt` are its translations. Plain text, no markdown, non-technical, and consistent with README.md. **Keep it short: a couple of paragraphs on the core value proposition, then a pointer to the GitHub repo.** Do NOT grow it into feature lists: no per-card breakdowns, settings detail, or requirement lists. All of that belongs in README.md. App Store Guidelines 1.3 reject descriptions that accumulate those sections. The current README.txt files still contain such sections (see `TODO.md`). When a new feature lands, update README.md and leave the README*.txt files alone unless the core pitch itself changed. If it did, update all 13 languages together.

When finishing a feature, check both before committing.

## Homey Compose: never edit `app.json` directly

The root `app.json` is **generated** by the Homey CLI from `.homeycompose/app.json`, `.homeycompose/flow/{actions,conditions,triggers}/*.json`, `.homeycompose/capabilities/*.json`, `.homeycompose/discovery/*.json`, and `drivers/*/driver.compose.json` / `driver.settings.compose.json`. Make manifest changes in those source files. The `api` section (the `/textToImage` route for `api.mts`) lives in `.homeycompose/app.json`. For version bumps, see [Releasing](#releasing).

## Architecture

- **`app.mts` (`StreamDeckApp`)** relays settings writes: it listens to `homey.settings` `set`/`unset`, and for keys `image-<id>`, `dashboard-<id>` and `variable-<id>` it re-emits `set-image` / `set-dashboard` / `set-variable` (or `unset-*`) with the id on the same emitter. It also owns the three `update_variable*` action cards, which render a sample with `TextToImage` and write `variable-<id>`. On init it removes orphaned settings keys (`Store.cleanSettings`).
- **`drivers/network-dock/device.mts` (`NetworkDock`)** listens to those `set-*`/`unset-*` events to redraw keys, owns the TCP connection (`StreamDeckTcpConnectionManager`), turns key presses into Flow triggers, and handles the `onoff` / `dim` / `dashboard` capabilities and the dashboard cards.
- **`lib/storage.mts` (`Store`)** is a read-through cache over `homey.settings`. **The app and every device each create their own `Store`**, so a cache is only invalidated through the settings events. Writes normally come from the settings page; the only writers in app code are `setVariable` and `updateDashboard`.
- **`lib/cardListener.mts`** holds the shared autocomplete (images, variables, dashboards) and run listeners (matching `args` against the trigger `state`). **`lib/streamDeckAdapter.mts`** and **`lib/textToImage.mts`** do all the drawing.
- **`settings/index.html`** is a single static page that writes directly to `homey.settings` via `Homey.set`.

## Translations

Supported languages (13): en, nl, de, fr, it, sv, no, es, da, ru, pl, ko, ar. User-facing strings live in `locales/*.json`, in every language key of each `.homeycompose` / driver compose JSON, and in `README.{lang}.txt`. When adding or changing a card or string, update all languages. `test/manifest.test.mts` fails when a compose file or locale is missing a language. The `homey-translate` skill covers adding a new language.

## Releasing

**Every publication needs a new version number.** The version lives in **three** places, and all three must be bumped together:

1. `.homeycompose/app.json` is the source of truth. Everything else follows it.
2. `app.json` is generated. Refresh it with `homey app build` after step 1 and commit the regenerated file.
3. `package.json` is **purely cosmetic, so keep it in sync by hand.** Nothing reads it: the Homey CLI only uses the dependency list, and no app code reads a version. It drifted to `1.0.0` while the app was at `1.1.9`, because `homey app publish` and the release workflow bump the manifest and never touch it. Update it with `npm version <x.y.z> --no-git-tag-version`, which also updates the root of `package-lock.json`. Never run plain `npm version`, which also creates a commit and a git tag. `test/manifest.test.mts` checks that the three match.

Then add the release's entry to `.homeychangelog.json`. Use user-facing wording that describes what changed for the user, not the commit subjects, and skip anything that only touches docs. Run `homey app validate --level publish` before committing.

The `Release` GitHub workflow (`workflow_dispatch` with major/minor/patch plus a changelog) does steps 1, 2 and the changelog, commits, tags `vX.Y.Z`, creates a GitHub release, **and publishes the app** in the same run. It also syncs `package.json` / `package-lock.json` with `npm version … --no-git-tag-version`.

Each published version stands on its own. Publishing uploads it as a **test** version that is reachable only by its own link (see the "Test version" link in README.md), and **certifying it promotes that version to live**, auto-updating every existing install. The standing plan is to certify every publication, so treat a publish as "this is going to all users shortly" rather than as a private build. Publishing never overwrites anything: an older version is superseded only when a newer one is certified.
