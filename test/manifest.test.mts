import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = new URL('..', import.meta.url).pathname
const readJson = (path: string) => JSON.parse(readFileSync(join(root, path), 'utf8'))

const LANGUAGES = readdirSync(join(root, 'locales')).map((file) => file.replace(/\.json$/, '')).sort()

const flowCardFiles = ['actions', 'conditions', 'triggers'].flatMap((type) =>
  readdirSync(join(root, '.homeycompose/flow', type))
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ type, path: join('.homeycompose/flow', type, file) })))

const translatedFiles = [
  ...flowCardFiles.map((entry) => entry.path),
  '.homeycompose/app.json',
  '.homeycompose/capabilities/dashboard.json',
  'drivers/network-dock/driver.compose.json',
  'drivers/network-dock/driver.settings.compose.json',
  'drivers/virtual-deck/driver.compose.json',
  'drivers/virtual-deck/driver.settings.compose.json',
  'widgets/virtual-deck/widget.compose.json',
]

/** Every object with a string `en` key is a translation; returns the ones missing a language. */
function missingTranslations(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => missingTranslations(item, `${path}[${index}]`))
  }
  if (value === null || typeof value !== 'object') {
    return []
  }
  const object = value as Record<string, unknown>
  if (typeof object.en === 'string') {
    return LANGUAGES.filter((language) => !object[language]).map((language) => `${path}.${language}`)
  }
  return Object.entries(object).flatMap(([key, child]) => missingTranslations(child, `${path}.${key}`))
}

it('supports the 13 documented languages', () => {
  expect(LANGUAGES).toEqual(['ar', 'da', 'de', 'en', 'es', 'fr', 'it', 'ko', 'nl', 'no', 'pl', 'ru', 'sv'])
})

describe('compose files', () => {
  it.each(translatedFiles)('%s is translated into every language', (path) => {
    expect(missingTranslations(readJson(path))).toEqual([])
  })

  it.each(flowCardFiles.map((entry) => entry.path))('%s has no empty args/tokens arrays', (path) => {
    const card = readJson(path)
    expect(card.args === undefined || card.args.length > 0).toBe(true)
    expect(card.tokens === undefined || card.tokens.length > 0).toBe(true)
  })

  it('app.json is regenerated from .homeycompose (same flow card ids)', () => {
    const manifest = readJson('app.json')
    for (const type of ['actions', 'conditions', 'triggers']) {
      const composed = flowCardFiles.filter((entry) => entry.type === type).map((entry) => readJson(entry.path).id).sort()
      const generated = (manifest.flow[type] as { id: string }[]).map((card) => card.id).sort()
      expect(generated, `flow.${type}`).toEqual(composed)
    }
  })
})

describe('virtual deck', () => {
  it('every device card is offered for the Network Dock and the virtual deck', () => {
    const filters = flowCardFiles
      .flatMap((entry) => readJson(entry.path).args ?? [])
      .filter((arg: { type: string }) => arg.type === 'device')
      .map((arg: { filter: string }) => arg.filter)
    expect(filters.length).toBeGreaterThan(0)
    expect(new Set(filters)).toEqual(new Set(['driver_id=network-dock|virtual-deck']))
  })

  it('the model setting offers every model the virtual deck knows', async () => {
    const { VIRTUAL_DECK_MODELS } = await import('../lib/virtualStreamDeck.mjs')
    const [setting] = readJson('drivers/virtual-deck/driver.settings.compose.json')
    expect(setting.values.map((value: { id: string }) => value.id).sort()).toEqual(Object.keys(VIRTUAL_DECK_MODELS).sort())
    expect(Object.keys(VIRTUAL_DECK_MODELS)).toContain(setting.value)
  })

  it.each(['public/index.html', 'preview-light.png', 'preview-dark.png', 'api.mts'])('the widget has %s', (file) => {
    expect(readFileSync(join(root, 'widgets/virtual-deck', file)).length).toBeGreaterThan(0)
  })

  it('app.json has the widget and the driver', () => {
    const manifest = readJson('app.json')
    expect(Object.keys(manifest.widgets)).toEqual(['virtual-deck'])
    expect(manifest.drivers.map((driver: { id: string }) => driver.id).sort()).toEqual(['network-dock', 'virtual-deck'])
  })
})

describe('locales and READMEs', () => {
  const keys = (object: object, prefix = ''): string[] =>
    Object.entries(object).flatMap(([key, value]) =>
      typeof value === 'object' && value !== null ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`])

  const english = keys(readJson('locales/en.json')).sort()

  it.each(LANGUAGES.filter((language) => language !== 'en'))('locales/%s.json has the same keys as en.json', (language) => {
    expect(keys(readJson(`locales/${language}.json`)).sort()).toEqual(english)
  })

  it.each(LANGUAGES)('README.txt exists for %s', (language) => {
    const file = language === 'en' ? 'README.txt' : `README.${language}.txt`
    expect(readFileSync(join(root, file), 'utf8').trim()).not.toBe('')
  })

  // App Store Guidelines 1.3: the store description is a short pitch, not a feature list. Details go in README.md.
  it.each(LANGUAGES)('README.txt for %s is a short pitch that points to GitHub', (language) => {
    const file = language === 'en' ? 'README.txt' : `README.${language}.txt`
    const text = readFileSync(join(root, file), 'utf8').trim()
    const paragraphs = text.split(/\n\s*\n/)

    expect(paragraphs.length).toBeLessThanOrEqual(4)
    expect(text).not.toMatch(/^\s*(-{3,}|- |\*)/m)
    expect(paragraphs.at(-1)).toContain('https://github.com/stefanrenne/nl.stefanrenne.streamdeck')
  })
})

describe('release metadata', () => {
  const version = readJson('.homeycompose/app.json').version

  it('app.json and package.json match the .homeycompose version', () => {
    expect(readJson('app.json').version).toBe(version)
    expect(readJson('package.json').version).toBe(version)
  })

  it('.homeychangelog.json is valid JSON with an entry for the current version', () => {
    expect(readJson('.homeychangelog.json')[version]?.en).toBeTruthy()
  })
})

// zod (under jimp) and minimatch (under eslint and typescript-eslint) only have fixes in a newer
// major than their parents ask for, so package.json overrides them. Every copy in the lockfile
// must be a patched version.
describe('vulnerable dependencies are overridden (GHSA-g3hv-75wg-m249, zod memory exhaustion)', () => {
  const packages: Record<string, { version: string }> = readJson('package-lock.json').packages
  const versions = (name: string) => Object.entries(packages)
    .filter(([path]) => path.endsWith(`node_modules/${name}`))
    .map(([, entry]) => entry.version)
  const atLeast = (version: string, minimum: string) => {
    const [a, b] = [version, minimum].map((v) => v.split('.').map(Number))
    for (let i = 0; i < 3; i++) {
      if (a[i] !== b[i]) return a[i] > b[i]
    }
    return true
  }

  it.each([['zod', '4.6.6'], ['minimatch', '11.0.1']])('every %s is at least %s', (name, minimum) => {
    expect(versions(name).length).toBeGreaterThan(0)
    for (const version of versions(name)) {
      expect(atLeast(version, minimum), `${name}@${version}`).toBe(true)
    }
  })
})
