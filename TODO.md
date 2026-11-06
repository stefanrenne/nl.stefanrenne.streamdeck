# TODO

Status: `[ ]` open · `[~]` in progress · `[?]` needs a decision or verification

When an item is done, move it to [COMPLETED.md](COMPLETED.md) with its context (root cause, gotchas, how it was verified). Items marked with a test have an `it.todo(...)` in `test/`: turn it into a real test when fixing.

## Bugs

- [?] **The Release workflow needs a bypass in the `develop` ruleset.** The workflow is fixed (see COMPLETED.md, 2026-11-06), but its push still fails until GitHub Actions is a bypass actor of the ruleset "Disable push to develop" with bypass mode *Always* (Settings → Rules → Rulesets → Bypass list → Add bypass → Apps → GitHub Actions). Only the repo owner can change that. Then run Release once (1.2.1: patch, with the changelog of the draft release) and move this item to COMPLETED.md.

## Cleanup

None open.
