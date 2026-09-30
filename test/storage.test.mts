import { beforeEach, describe, expect, it } from 'vitest'
import { Store } from '../lib/storage.mjs'
import { createFakeHomey, createStore, FakeHomey, FakeSettings, RED_PIXEL_PNG, seedSettings } from './helpers/fake-homey.mjs'

let homey: FakeHomey
let settings: FakeSettings
let store: Store

beforeEach(() => {
  const fake = createFakeHomey()
  homey = fake.homey
  settings = fake.settings
  store = createStore(homey)
})

describe('images', () => {
  it('decodes the stored data URL into a buffer', () => {
    seedSettings(settings, { images: [{ id: 'img', name: 'Lamp' }] })

    const image = store.getImage('img')

    expect(image).toMatchObject({ id: 'img', name: 'Lamp', base64Image: RED_PIXEL_PNG })
    expect(image?.imageBuffer.subarray(1, 4).toString()).toBe('PNG')
  })

  it('returns undefined when the metadata or the data is missing', () => {
    seedSettings(settings, { images: [{ id: 'img', name: 'Lamp' }] })
    settings.values.delete('image-img')
    expect(store.getImage('img')).toBeUndefined()
    expect(store.getImage('unknown')).toBeUndefined()
  })

  it('getImages skips images whose data is missing', () => {
    seedSettings(settings, { images: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] })
    settings.values.delete('image-b')
    expect(store.getImages().map((image) => image.id)).toEqual(['a'])
  })

  it('caches images until invalidateImage', () => {
    seedSettings(settings, { images: [{ id: 'img', name: 'Old' }] })
    expect(store.getImage('img')?.name).toBe('Old')

    settings.seed('images', [{ id: 'img', name: 'New' }])
    expect(store.getImage('img')?.name).toBe('Old')

    store.invalidateImage('img')
    expect(store.getImage('img')?.name).toBe('New')
  })
})

describe('variables', () => {
  it('applies defaults for missing colours and maps an empty second line to undefined', () => {
    seedSettings(settings, { variables: [{ id: 'v', name: 'Temp', firstLine: '21°' }] })
    settings.seed('variable-v', { firstLine: '21°', secondLine: '', sample: 'sample' })

    expect(store.getVariable('v')).toEqual({
      id: 'v', name: 'Temp', firstLine: '21°', secondLine: undefined, textColor: '#ffffff', backgroundColor: '#000000', base64Sample: 'sample',
    })
  })

  it('still returns a variable with empty text when only its metadata exists', () => {
    settings.seed('variables', [{ id: 'v', name: 'Temp' }])
    expect(store.getVariable('v')).toMatchObject({ id: 'v', firstLine: '', secondLine: undefined, base64Sample: undefined })
  })

  it('setVariable stores an undefined second line as an empty string', () => {
    store.setVariable('v', 'First', undefined, '#fff', '#000', 'sample')
    expect(settings.get('variable-v')).toEqual({ firstLine: 'First', secondLine: '', textColor: '#fff', backgroundColor: '#000', sample: 'sample' })
  })

  it('invalidateVariable also drops cached dashboards that show the variable', () => {
    seedSettings(settings, {
      variables: [{ id: 'v', name: 'Temp', firstLine: 'old' }],
      dashboards: [{ id: 'd', name: 'Home', items: [{ type: 'variable', item: 1, variableId: 'v', payload: '' }] }],
    })
    expect(store.getDashboard('d')?.items[1]).toMatchObject({ kind: 'variable', firstLine: 'old' })

    settings.seed('variable-v', { firstLine: 'new', secondLine: '', sample: '' })
    store.invalidateVariable('v')

    expect(store.getDashboard('d')?.items[1]).toMatchObject({ kind: 'variable', firstLine: 'new' })
  })
})

describe('dashboards', () => {
  beforeEach(() => {
    seedSettings(settings, {
      images: [{ id: 'img', name: 'Lamp' }],
      variables: [{ id: 'var', name: 'Temp', firstLine: '21°', secondLine: 'inside', textColor: '#ff0000' }],
      dashboards: [{
        id: 'd',
        name: 'Home',
        columns: 5,
        rows: 3,
        items: [
          { type: 'image', item: 1, imageId: 'img', payload: 'on' },
          { type: 'variable', item: 2, variableId: 'var', payload: '' },
          { type: 'empty', item: 3, payload: '{\\x22room\\x22:\\x27kitchen\\x27}' },
          { type: 'image', item: 4, imageId: 'deleted', payload: 'kept' },
        ],
      }],
    })
  })

  it('resolves items by their 1-based position, with 32 empty defaults', () => {
    const dashboard = store.getDashboard('d')

    expect(dashboard).toMatchObject({ id: 'd', name: 'Home', columns: 5, rows: 3, usedVariableIds: ['var'] })
    expect(dashboard?.items[1]).toMatchObject({ kind: 'image', name: 'Lamp', payload: 'on', imageId: 'img' })
    expect(dashboard?.items[2]).toMatchObject({ kind: 'variable', name: 'Temp', firstLine: '21°', secondLine: 'inside', textColor: '#ff0000', backgroundColor: '#000000' })
    expect(Object.keys(dashboard?.items ?? {})).toHaveLength(32)
    expect(dashboard?.items[32]).toEqual({ kind: 'empty', payload: '' })
  })

  it('unescapes the quotes the settings page escapes in payloads', () => {
    expect(store.getDashboard('d')?.items[3]).toEqual({ kind: 'empty', payload: '{"room":\'kitchen\'}' })
  })

  it('turns an item pointing at a deleted image into an empty item that keeps its payload', () => {
    expect(store.getDashboard('d')?.items[4]).toEqual({ kind: 'empty', payload: 'kept' })
  })

  it('returns undefined for an unknown dashboard', () => {
    expect(store.getDashboard('unknown')).toBeUndefined()
  })

  it('caches dashboards until invalidateDashboard', () => {
    expect(store.getDashboard('d')?.name).toBe('Home')
    settings.seed('dashboards', [{ id: 'd', name: 'Renamed' }])
    expect(store.getDashboard('d')?.name).toBe('Home')

    store.invalidateDashboard('d')
    expect(store.getDashboard('d')?.name).toBe('Renamed')
  })

  it.each([[8, 4], [5, 3], [4, 2], [3, 2]])('updateDashboard stores a %ix%i layout', (columns, rows) => {
    store.updateDashboard('d', columns, rows)
    expect(settings.get('dashboard-d')).toMatchObject({ columns, rows })
  })

  it('updateDashboard ignores layouts no Stream Deck has', () => {
    store.updateDashboard('d', 4, 3)
    expect(settings.get('dashboard-d')).toMatchObject({ columns: 5, rows: 3 })
  })

  it('getDashboardMetadata lists id and name', () => {
    expect(store.getDashboardMetadata()).toEqual([{ id: 'd', name: 'Home' }])
  })
})

describe('cleanSettings', () => {
  it('removes keys that no metadata list references and keeps the rest', () => {
    seedSettings(settings, {
      images: [{ id: 'img', name: 'Lamp' }],
      variables: [{ id: 'var', name: 'Temp' }],
      dashboards: [{ id: 'd', name: 'Home' }],
    })
    settings.seed('image-orphan', RED_PIXEL_PNG)
    settings.seed('dashboard-orphan', {})
    settings.seed('something-else', 1)

    store.cleanSettings()

    expect(settings.getKeys().sort()).toEqual(['dashboard-d', 'dashboards', 'image-img', 'images', 'variable-var', 'variables'])
  })

  it('does nothing on an empty install', () => {
    store.cleanSettings()
    expect(settings.getKeys()).toEqual([])
  })
})
