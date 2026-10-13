import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The settings page is a static HTML file without a build step, so these tests check its source.
const page = readFileSync(new URL('../settings/index.html', import.meta.url), 'utf8')
const lines = page.split('\n').map((text, index) => ({ line: index + 1, text: text.trim() }))

describe('settings page', () => {
  it('writes user-provided names as text, not HTML (regression f36cfe8)', () => {
    // Image names come from file names, so `innerHTML = image.name` would render markup (or run script) from them.
    const htmlFromName = lines.filter(({ text }) => /\.innerHTML\s*=\s*[^;]*\.name\b/.test(text))
    expect(htmlFromName).toEqual([])
  })
})
