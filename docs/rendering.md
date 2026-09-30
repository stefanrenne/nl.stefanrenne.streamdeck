# Rendering

All drawing goes through `lib/streamDeckAdapter.mts`, which pushes raw RGBA buffers to the deck, and `lib/textToImage.mts`, which produces jimp images.

## streamDeckAdapter

| Function | Behaviour |
|---|---|
| `getButtonControlSize(deck)` | `{ columns, rows, total }` = max `column + 1` / `row + 1` over `deck.CONTROLS`. (Known issue: it counts non-LCD controls too. See [device.md](device.md).) |
| `renderDashboard(deck, dashboard)` | For each control `i`, looks up `dashboard.items[i + 1]`. `variable` → `renderText`, `image` → `renderImage`, anything else → `clearKey`. All keys render in parallel. Each failure is caught and logged, so one bad key doesn't stop the others. |
| `renderText(deck, control, first, second, textColor, bg)` | `TextToImage.create(control.pixelSize.width, …)` → `fillKeyBuffer(index, rgba)` |
| `renderImage(deck, control, buffer)` | decodes the stored image with jimp, resizes it to `pixelSize`, then `fillKeyBuffer` |
| `renderHomeyLogo(deck)` | `assets/homey-logo.png`, scaled to fit the panel minus 50 px padding and centered on black, then `fillPanelBuffer`. If `calculateFillPanelDimensions()` is `null`, it calls `clearPanel()` instead. |
| `renderPincodeDashboard(deck)` | **Unused.** An unfinished pincode keypad. Its early return is inverted, and it divides by `rows` where it means `columns`. |

The logo path is resolved from `import.meta.url` (`fileURLToPath`). In ESM there is no `__dirname`, and using it crashed the Homey dashboard in 1.1.8 (fix 345f453).

## TextToImage

`TextToImage.create(size, firstLine, secondLine | undefined, textColor, backgroundColor)` returns a square jimp image:

- It picks the largest bundled jimp font (`SANS_128/64/32/16_BLACK`, falling back to 8) where the line fits within `size - 4` px wide and the available height: the full size for one line, or half the size for two lines.
- The text is vertically centered as a block and each line is horizontally centered.
- jimp's fonts are black, so each line is drawn on a transparent layer and colored with an `xor` of the text colour, then blitted onto the background.
- Colours are `#rrggbb` or `#rgb`.
- `TextToImage.sampleSize` (192) is the size used for the variable previews (`sample`) shown in the settings page and in flow card autocomplete.
