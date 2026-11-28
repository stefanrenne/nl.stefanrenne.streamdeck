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

  it('stores dashboard columns and rows as numbers', () => {
    // The pickers are read from innerHTML, so without Number() they're saved as "5" / "3".
    const dashboardData = lines.find(({ text }) => text.startsWith('const dashboardData ='))
    expect(dashboardData?.text).toContain("'columns': Number(columns)")
    expect(dashboardData?.text).toContain("'rows': Number(rows)")
  })

  it('stores each key\'s navigation with the dashboard', () => {
    // The format lib/storage.mts reads (toDashboardNavigation): { type: 'open', dashboardId, timeout } or { type: 'back' }.
    expect(page).toContain('navigation: readNavigation(item),')
    expect(page).toContain("return { type: 'back' };")
    expect(page).toContain("return { type: 'open', dashboardId: $item.dataset.navigationDashboardId, timeout: Number($item.dataset.navigationTimeout) || 0 };")
  })

  it('offers a choice of timeouts instead of a number field', () => {
    // Typed values were silently rounded or clamped on save, and 0 meant "stays open".
    expect(page).toContain('<select class="homey-form-select" id="navigationTimeout"></select>')
    expect(page).not.toContain('id="navigationTimeout" type="number"')
  })

  it('never picks a dashboard to open on the user\'s behalf', () => {
    // An 'open' whose target was deleted used to fall back to the first other dashboard.
    expect(page).not.toContain("dashboards[0]?.id")
    expect(page).toContain("$saveItemButton.disabled = isOpen && $dashboard.value === '';")
  })

  it('stores only id and name in the variables list', () => {
    // The full variable (with its base64 sample) belongs in variable-<id> only.
    const listWrites = lines.filter(({ text }) => text.includes("Homey.set('variables'"))
    expect(listWrites.length).toBeGreaterThan(0)
    for (const { text } of listWrites) {
      expect(text).toMatch(/Homey\.set\('variables', toMetadata\(/)
    }
  })
})
