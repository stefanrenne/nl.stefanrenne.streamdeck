# TODO

Status: `[ ]` open · `[~]` in progress · `[?]` needs a decision or verification

When an item is done, move it to [COMPLETED.md](COMPLETED.md) with its context (root cause, gotchas, how it was verified). Items marked with a test have an `it.todo(...)` in `test/`: turn it into a real test when fixing.

## Bugs

- [?] **The Release workflow needs the `RELEASE_TOKEN` secret.** The bot's own `GITHUB_TOKEN` may not push past the `develop` ruleset, and GitHub Actions can't be added to the bypass list of a personal repo (only installed apps are listed). The workflow now pushes with `RELEASE_TOKEN`, a fine-grained personal access token of the repo owner (only this repo; Contents: read and write), whose admin role bypasses the ruleset. The owner creates it and adds it under Settings → Secrets and variables → Actions. Then run Release once (1.2.1: patch, with the changelog of the draft release) and move this item to COMPLETED.md. The token expires: renew it when a release fails on authentication.

## Cleanup

None open.
