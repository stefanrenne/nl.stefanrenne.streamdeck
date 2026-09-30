import { beforeEach, describe, expect, it, vi } from 'vitest'
import StreamDeckApp from '../app.mjs'
import api from '../api.mjs'
import NetworkDockDriver from '../drivers/network-dock/driver.mjs'
import { createFakeHomey, FakeCard, FakeHomey, FakeSettings, RED_PIXEL_PNG, seedSettings } from './helpers/fake-homey.mjs'

let homey: FakeHomey
let settings: FakeSettings
let card: (id: string) => FakeCard

beforeEach(() => {
  const fake = createFakeHomey()
  homey = fake.homey
  settings = fake.settings
  card = fake.card
})

const startApp = async () => {
  const app = new (StreamDeckApp as unknown as new (homey: FakeHomey) => InstanceType<typeof StreamDeckApp>)(homey)
  await app.onInit()
  return app
}

describe('onInit', () => {
  it('removes orphaned settings keys', async () => {
    seedSettings(settings, { images: [{ id: 'img', name: 'Lamp' }] })
    settings.seed('image-orphan', RED_PIXEL_PNG)

    await startApp()

    expect(settings.getKeys().sort()).toEqual(['image-img', 'images'])
  })

  it('registers the three update-variable action cards', async () => {
    await startApp()
    for (const id of ['update_variable', 'update_variable_firstline', 'update_variable_secondline']) {
      expect(card(id).runListener, id).toBeDefined()
      expect(card(id).autocompleteListeners.has('variable'), id).toBe(true)
    }
  })
})

describe('settings relay', () => {
  it.each(['image', 'dashboard', 'variable'])('re-emits set/unset of %s-<id> as set-%s / unset-%s with the id', async (kind) => {
    await startApp()
    const onSet = vi.fn()
    const onUnset = vi.fn()
    settings.on(`set-${kind}`, onSet)
    settings.on(`unset-${kind}`, onUnset)

    settings.set(`${kind}-abc`, {})
    settings.unset(`${kind}-abc`)

    expect(onSet).toHaveBeenCalledWith('abc')
    expect(onUnset).toHaveBeenCalledWith('abc')
  })

  it('ignores the metadata lists themselves', async () => {
    await startApp()
    const listener = vi.fn()
    for (const event of ['set-image', 'set-dashboard', 'set-variable']) settings.on(event, listener)

    settings.set('images', [])
    settings.set('dashboards', [])
    settings.set('variables', [])

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('update variable actions', () => {
  beforeEach(() => {
    seedSettings(settings, { variables: [{ id: 'v', name: 'Temp', firstLine: 'old 1', secondLine: 'old 2', textColor: '#ff0000', backgroundColor: '#0000ff' }] })
  })

  const stored = () => settings.get('variable-v') as { firstLine: string, secondLine: string, textColor: string, backgroundColor: string, sample: string }

  it('update_variable trims both lines, keeps the colours and renders a new sample', async () => {
    await startApp()
    const onSet = vi.fn()
    settings.on('set-variable', onSet)

    await card('update_variable').run({ variable: { id: 'v' }, firstLine: ' 22° ', secondLine: ' outside ' })

    expect(stored()).toMatchObject({ firstLine: '22°', secondLine: 'outside', textColor: '#ff0000', backgroundColor: '#0000ff' })
    expect(stored().sample).toMatch(/^data:image\/jpeg;base64,/)
    expect(onSet).toHaveBeenCalledWith('v')
  })

  it('update_variable_firstline keeps the second line', async () => {
    await startApp()
    await card('update_variable_firstline').run({ variable: { id: 'v' }, firstLine: 'new 1' })
    expect(stored()).toMatchObject({ firstLine: 'new 1', secondLine: 'old 2' })
  })

  it('update_variable_secondline keeps the first line, and an omitted second line clears it', async () => {
    await startApp()
    await card('update_variable_secondline').run({ variable: { id: 'v' }, secondLine: 'new 2' })
    expect(stored()).toMatchObject({ firstLine: 'old 1', secondLine: 'new 2' })

    await card('update_variable_secondline').run({ variable: { id: 'v' } })
    expect(stored()).toMatchObject({ firstLine: 'old 1', secondLine: '' })
  })

  it('a later update sees the previous one (the relay invalidates the app store cache)', async () => {
    await startApp()
    await card('update_variable_firstline').run({ variable: { id: 'v' }, firstLine: 'first' })
    await card('update_variable_secondline').run({ variable: { id: 'v' }, secondLine: 'second' })
    expect(stored()).toMatchObject({ firstLine: 'first', secondLine: 'second' })
  })

  it('does nothing for an unknown variable', async () => {
    await startApp()
    await card('update_variable').run({ variable: { id: 'unknown' }, firstLine: 'a', secondLine: 'b' })
    expect(settings.get('variable-unknown')).toBeUndefined()
  })
})

describe('web api', () => {
  it('textToImage returns a jpeg data URL and defaults to white on black', async () => {
    const result = await api.textToImage({ body: { firstLine: 'Hi', secondLine: '' } })
    expect(result).toMatch(/^data:image\/jpeg;base64,/)
  })
})

describe('driver', () => {
  it('lists every discovered Network Dock with its address as the ipAddress setting', async () => {
    const driver = new (NetworkDockDriver as unknown as new (homey: FakeHomey) => InstanceType<typeof NetworkDockDriver> & { discoveryResults: object })(homey)
    driver.discoveryResults = {
      a: { id: 'Network Dock A', address: '192.168.1.10' },
      b: { id: 'Network Dock B', address: '192.168.1.11' },
    }

    expect(await driver.onPairListDevices()).toEqual([
      { name: 'Network Dock A', data: { id: 'Network Dock A' }, settings: { ipAddress: '192.168.1.10' } },
      { name: 'Network Dock B', data: { id: 'Network Dock B' }, settings: { ipAddress: '192.168.1.11' } },
    ])
  })
})
