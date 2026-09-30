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
