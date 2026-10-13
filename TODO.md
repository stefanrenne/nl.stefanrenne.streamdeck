# TODO

Status: `[ ]` open · `[~]` in progress · `[?]` needs a decision or verification

When an item is done, move it to [COMPLETED.md](COMPLETED.md) with its context (root cause, gotchas, how it was verified). Items marked with a test have an `it.todo(...)` in `test/`: turn it into a real test when fixing.

## Bugs

- [ ] **`@elgato-stream-deck/*` 7.8.0 doesn't connect on Homey.** With 7.8.0, `connectTo` never results in `connected` (not even for the dock itself) and no `error` is emitted when the app runs in Docker (`homey app run`, and so on a Homey). 7.7.1 connects within a second in the same setup. On the macOS host, both versions connect. Pinned to `~7.7.1` (package.json, Dependabot ignore, `manifest.test.mts`). Find the cause (suspects: the keepalive/timeout rework in `socketWrapper.js`, `TcpCoraHidDevice.#disconnected`), report it upstream at [node-elgato-stream-deck](https://github.com/Julusian/node-elgato-stream-deck), and lift the pin once a fixed version is verified with `homey app run`. Note: plain `docker run` containers on the dev Mac get `ECONNREFUSED` from the dock with either version, so they can't be used to reproduce this.

## Cleanup

None open.
