import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Jimp } from 'jimp'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { getButtonControlSize, renderHomeyLogo } from '../lib/streamDeckAdapter.mjs'
import { VIRTUAL_DECK_MODELS, VirtualDeckModelId, VirtualStreamDeck } from '../lib/virtualStreamDeck.mjs'
import VirtualDeck from '../drivers/virtual-deck/device.mjs'
import VirtualDeckDriver from '../drivers/virtual-deck/driver.mjs'
import api from '../widgets/virtual-deck/api.mjs'
import { createFakeHomey, FakeCard, FakeHomey, FakeSettings, seedSettings } from './helpers/fake-homey.mjs'

/** A solid `width`×`height` RGBA buffer. */
const solid = (width: number, height: number, [r, g, b]: number[]) =>
  Buffer.from(Array.from({ length: width * height }, () => [r, g, b, 255]).flat())

/** The colour of the centre pixel of a key image (a JPEG data URL). */
const centreColour = async (image: string | null) => {
  const jimp = await Jimp.fromBuffer(Buffer.from(image!.split(',')[1], 'base64'))
  const { data, width, height } = jimp.bitmap
  const i = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4
  return [data[i], data[i + 1], data[i + 2]]
}

const near = (actual: number[], expected: number[]) =>
  actual.every((value, i) => Math.abs(value - expected[i]) <= 8)

describe('VirtualStreamDeck', () => {
  it.each(Object.keys(VIRTUAL_DECK_MODELS) as VirtualDeckModelId[])('lays out the LCD keys of a %s', (model) => {
    const { name, columns, rows, pixelSize } = VIRTUAL_DECK_MODELS[model]
    const deck = new VirtualStreamDeck(model)

    expect(deck.PRODUCT_NAME).toBe(name)
    expect(deck.CONTROLS).toHaveLength(columns * rows)
    expect(getButtonControlSize(deck)).toEqual({ columns, rows, total: columns * rows })
    expect(deck.CONTROLS[columns + 1]).toMatchObject({ type: 'button', feedbackType: 'lcd', index: columns + 1, row: 1, column: 1, pixelSize: { width: pixelSize, height: pixelSize } })
    expect(deck.getState()).toEqual({ model, name, columns, rows, keys: Array(columns * rows).fill(null), brightness: 100 })
  })

  it('stores a filled key as a JPEG and emits it', async () => {
    const deck = new VirtualStreamDeck('mini')
    const listener = vi.fn()
    deck.on('key', listener)

    await deck.fillKeyBuffer(4, solid(80, 80, [255, 0, 0]), { format: 'rgba' })

    const image = deck.getState().keys[4]
    expect(image).toMatch(/^data:image\/jpeg;base64,/)
    expect(listener).toHaveBeenCalledWith(4, image)
    expect(near(await centreColour(image), [255, 0, 0])).toBe(true)
  })

  it('accepts the other formats the deck library takes', async () => {
    const deck = new VirtualStreamDeck('mini')
    const bgr = Buffer.from(Array.from({ length: 80 * 80 }, () => [255, 0, 0]).flat())

    await deck.fillKeyBuffer(0, bgr, { format: 'bgr' })

    expect(near(await centreColour(deck.getState().keys[0]), [0, 0, 255])).toBe(true)
  })

  it('rejects a buffer of the wrong size or a key that does not exist', async () => {
    const deck = new VirtualStreamDeck('mini')
    await expect(deck.fillKeyBuffer(0, solid(72, 72, [0, 0, 0]), { format: 'rgba' })).rejects.toThrow(RangeError)
    await expect(deck.fillKeyBuffer(6, solid(80, 80, [0, 0, 0]), { format: 'rgba' })).rejects.toThrow(TypeError)
    await expect(deck.clearKey(-1)).rejects.toThrow(TypeError)
  })

  it('a clear wins over a fill of the same key that was still encoding', async () => {
    const deck = new VirtualStreamDeck('mini')
    const fill = deck.fillKeyBuffer(0, solid(80, 80, [255, 0, 0]), { format: 'rgba' })
    await deck.clearKey(0)
    await fill

    expect(deck.getState().keys[0]).toBeNull()
  })

  it('clearPanel clears every key', async () => {
    const deck = new VirtualStreamDeck('mini')
    await deck.fillKeyBuffer(0, solid(80, 80, [255, 0, 0]), { format: 'rgba' })
    await deck.clearPanel()
    expect(deck.getState().keys).toEqual(Array(6).fill(null))
  })

  it('cuts a panel image into its keys', async () => {
    const deck = new VirtualStreamDeck('mini')
    const { width, height } = deck.calculateFillPanelDimensions()!
    expect({ width, height }).toEqual({ width: 240, height: 160 })
    // Top row red, bottom row blue.
    const panel = Buffer.concat([solid(width, height / 2, [255, 0, 0]), solid(width, height / 2, [0, 0, 255])])

    await deck.fillPanelBuffer(panel, { format: 'rgba' })

    const keys = deck.getState().keys
    expect(near(await centreColour(keys[2]), [255, 0, 0])).toBe(true)
    expect(near(await centreColour(keys[3]), [0, 0, 255])).toBe(true)
  })

  it('shows the Homey logo across the keys', async () => {
    const deck = new VirtualStreamDeck('mk2')
    await renderHomeyLogo(deck)
    expect(deck.getState().keys.every((key) => key !== null)).toBe(true)
  })

  it('rounds and clamps the brightness, and emits it', async () => {
    const deck = new VirtualStreamDeck('mini')
    const listener = vi.fn()
    deck.on('brightness', listener)

    await deck.setBrightness(28.6)
    await deck.setBrightness(150)

    expect(listener.mock.calls).toEqual([[29], [100]])
    expect(deck.getState().brightness).toBe(100)
  })

  it('emits down and up with the control, like a real deck', () => {
    const deck = new VirtualStreamDeck('mini')
    const events: string[] = []
    deck.on('down', (control) => events.push(`down ${control.index}`))
    deck.on('up', (control) => events.push(`up ${control.index}`))

    deck.press(5, 'down')
    deck.press(5, 'up')

    expect(events).toEqual(['down 5', 'up 5'])
    expect(() => deck.press(6, 'down')).toThrow(TypeError)
  })
})

type Harness = InstanceType<typeof VirtualDeck> & {
  capabilityValues: Map<string, unknown>
  capabilityListeners: Map<string, (value: unknown) => Promise<void>>
  settings: Record<string, unknown>
}

describe('VirtualDeck device', () => {
  let homey: FakeHomey
  let settings: FakeSettings
  let card: (id: string) => FakeCard
  let driverDevices: (id: string) => unknown[]

  const createDevice = (model: unknown = 'mini', capabilities: Record<string, unknown> = { dashboard: 'd-home', onoff: true, dim: 1 }) => {
    const Constructor = VirtualDeck as unknown as new (homey: FakeHomey, options: object) => Harness
    const device = new Constructor(homey, { settings: { model }, data: { id: 'virtual-1' }, name: 'Desk' })
    for (const [key, value] of Object.entries(capabilities)) {
      device.capabilityValues.set(key, value)
    }
    driverDevices('virtual-deck').push(device)
    return device
  }

  /** The realtime events sent so far, without the device id. */
  const published = () => homey.api.realtime.mock.calls.map(([event, data]) => {
    expect(event).toBe('virtual-deck')
    const { deviceId, ...rest } = data as { deviceId: string, type: string }
    expect(deviceId).toBe('virtual-1')
    return rest as { type: string, [key: string]: unknown }
  })

  beforeEach(() => {
    const fake = createFakeHomey()
    homey = fake.homey
    settings = fake.settings
    card = fake.card
    driverDevices = fake.driverDevices
    seedSettings(settings, {
      images: [{ id: 'img-lamp', name: 'Lamp' }],
      variables: [{ id: 'var-temp', name: 'Temperature', firstLine: '21°', secondLine: 'inside' }],
      dashboards: [
        { id: 'd-home', name: 'Home', columns: 3, rows: 2, items: [
          { type: 'image', item: 1, imageId: 'img-lamp', payload: 'lamp-payload' },
          { type: 'variable', item: 5, variableId: 'var-temp', payload: '' },
        ] },
        { id: 'd-movie', name: 'Movie night', columns: 3, rows: 2 },
      ],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('attaches a deck of the chosen model and draws the selected dashboard', async () => {
    const device = createDevice()
    await device.onInit()

    const state = device.getVirtualState()
    expect(state).toMatchObject({ model: 'mini', columns: 3, rows: 2, brightness: 100 })
    expect(state.keys.map((key) => key !== null)).toEqual([true, false, false, false, true, false])
    expect(published()[0]).toMatchObject({ type: 'state', state: { model: 'mini' } })
    expect(published().filter((event) => event.type === 'key')).toHaveLength(6)
  })

  it('falls back to a MK.2 for an unknown model', async () => {
    const device = createDevice('unknown')
    await device.onInit()
    expect(device.getVirtualState()).toMatchObject({ model: 'mk2', columns: 5, rows: 3 })
  })

  it('sends the brightness of the capabilities to the deck', async () => {
    const device = createDevice('mini', { dashboard: 'd-home', onoff: true, dim: 0.4 })
    await device.onInit()
    expect(device.getVirtualState().brightness).toBe(40)

    await device.capabilityListeners.get('onoff')?.(false)
    expect(device.getVirtualState().brightness).toBe(0)
    expect(published().at(-1)).toEqual({ type: 'brightness', brightness: 0 })
  })

  it('turns a press in the widget into the same Flow triggers as a real deck', async () => {
    const device = createDevice()
    await device.onInit()

    device.press(0, 'down')

    await vi.waitFor(() => expect(card('image_button_action').trigger).toHaveBeenCalled())
    expect(card('image_button_action').trigger).toHaveBeenCalledWith(device,
      expect.objectContaining({ dashboard: 'Home', imageName: 'Lamp', payload: 'lamp-payload', column: 1, row: 1, item: 'A1' }),
      { action: 'down', imageId: 'img-lamp', variableId: '' })
    expect(card('any_button_action').trigger).toHaveBeenCalled()
  })

  it('detects a single press, like a real deck', async () => {
    const device = createDevice()
    await device.onInit()
    vi.useFakeTimers()

    device.press(4, 'down')
    device.press(4, 'up')
    await vi.advanceTimersByTimeAsync(500)

    const actions = card('variable_button_action').trigger.mock.calls.map((call) => (call[2] as { action: string }).action)
    expect(actions).toEqual(['down', 'up', 'single'])
  })

  it('rejects an unknown action', async () => {
    const device = createDevice()
    await device.onInit()
    expect(() => device.press(0, 'click')).toThrow(TypeError)
  })

  it('redraws a variable key when the variable changes', async () => {
    const device = createDevice()
    await device.onInit()
    homey.api.realtime.mockClear()

    settings.set('variable-var-temp', { firstLine: '22°', secondLine: 'inside', textColor: '#ffffff', backgroundColor: '#000000', sample: '' })
    settings.emit('set-variable', 'var-temp')

    await vi.waitFor(() => expect(published()).toEqual([{ type: 'key', index: 4, image: expect.stringMatching(/^data:image\/jpeg/) }]))
  })

  it('switches to the new model when the setting changes, and resizes the dashboard like a real deck', async () => {
    const device = createDevice()
    await device.onInit()
    homey.api.realtime.mockClear()

    await device.onSettings({ oldSettings: { model: 'mini' }, newSettings: { model: 'xl' }, changedKeys: ['model'] })

    expect(device.getVirtualState()).toMatchObject({ model: 'xl', columns: 8, rows: 4 })
    expect(published()[0]).toMatchObject({ type: 'state', state: { model: 'xl', columns: 8, rows: 4 } })
    expect(settings.get('dashboard-d-home')).toMatchObject({ columns: 8, rows: 4 })
  })

  it('tells the widgets when it is deleted', async () => {
    const device = createDevice()
    await device.onInit()

    await device.onDeleted()

    expect(published().at(-1)).toEqual({ type: 'deleted' })
    expect(() => device.getVirtualState()).toThrow('not ready')
  })

  describe('widget api', () => {
    it('returns the state of the deck with the data id', async () => {
      const device = createDevice()
      await device.onInit()

      const state = await api.getState({ homey: homey as never, query: { deviceId: 'virtual-1' } })

      expect(state).toEqual(device.getVirtualState())
    })

    it('fails for a deck that does not exist', async () => {
      await expect(api.getState({ homey: homey as never, query: { deviceId: 'gone' } })).rejects.toThrow('not found')
    })

    it('passes a press on to the deck', async () => {
      const device = createDevice()
      await device.onInit()

      await api.press({ homey: homey as never, body: { deviceId: 'virtual-1', index: 0, action: 'down' } })

      await vi.waitFor(() => expect(card('image_button_action').trigger).toHaveBeenCalled())
    })
  })
})

describe('VirtualDeckDriver', () => {
  it('offers one virtual deck per model, each with its own id', async () => {
    const { homey } = createFakeHomey()
    const driver = new (VirtualDeckDriver as unknown as new (homey: FakeHomey) => InstanceType<typeof VirtualDeckDriver>)(homey)

    const devices = await driver.onPairListDevices()

    expect(devices.map((device) => device.settings.model)).toEqual(['mini', 'neo', 'plus', 'mk2', 'xl'])
    expect(new Set(devices.map((device) => device.data.id)).size).toBe(5)
    expect(devices.map((device) => device.name)).toEqual(['Stream Deck Mini', 'Stream Deck Neo', 'Stream Deck +', 'Stream Deck MK.2', 'Stream Deck XL'])
  })

  it('gives every model an icon of its own that exists in the driver assets', async () => {
    const { homey } = createFakeHomey()
    const driver = new (VirtualDeckDriver as unknown as new (homey: FakeHomey) => InstanceType<typeof VirtualDeckDriver>)(homey)

    const devices = await driver.onPairListDevices()

    expect(new Set(devices.map((device) => device.icon)).size).toBe(devices.length)
    for (const device of devices) {
      expect(existsSync(fileURLToPath(new URL(`../drivers/virtual-deck/assets${device.icon}`, import.meta.url)))).toBe(true)
    }
  })

  it('lets pairing pick one deck instead of adding every model', () => {
    const compose = JSON.parse(readFileSync(fileURLToPath(new URL('../drivers/virtual-deck/driver.compose.json', import.meta.url)), 'utf8'))

    expect(compose.pair.find((step: { id: string }) => step.id === 'list_devices').options).toEqual({ singular: true })
  })
})
