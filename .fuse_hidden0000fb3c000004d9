# TODO

Status: `[ ]` open · `[~]` in progress · `[?]` needs a decision or verification

When an item is done, move it to [COMPLETED.md](COMPLETED.md) with its context (root cause, gotchas, how it was verified). Items marked with a test have an `it.todo(...)` in `test/`: turn it into a real test when fixing.

## Bugs

- [ ] **The Release workflow can't push to `develop`.** The ruleset "Disable push to develop active branch" requires a pull request and verified signatures, and only the admin role may always bypass it. The workflow's `github-actions[bot]` commit is unsigned and pushed directly, so `Commit & Push` fails (first run, 2026-10-13: it pushed tag `v1.2.0` to an orphan commit before failing, which had to be deleted). Options: add GitHub Actions as a bypass actor (a repo security setting, the user's call), or have the workflow open a PR and tag/publish after it's merged. v1.2.0 was released by hand.

## Cleanup

None open.
