import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeHomey, FakeCard, FakeHomey, FakeSettings, seedSettings } from './helpers/fake-homey.mjs'
import { FakeStreamDeck, lcdButtons } from './helpers/fake-stream-deck.mjs'

// The real connection manager opens TCP sockets; the tests drive its events by hand.
vi.mock('@elgato-stream-deck/tcp', async () => {
  const { EventEmitter } = await import('node:events')
  class StreamDeckTcpConnectionManager extends EventEmitter {
    connectTo = vi.fn()
    disconnectFrom = vi.fn()
  }
  return { StreamDeckTcpConnectionManager, StreamDeckTcp: class {} }
})

const { default: NetworkDock } = await import('../drivers/network-dock/device.mjs')

type Control = FakeStreamDeck['CONTROLS'][number]

/** The device together with the fields of the mocked Homey.Device and its private collaborators. */
type DeviceMethods = Pick<InstanceType<typeof NetworkDock>,
  'onInit' | 'streamDeckEvent' | 'loadDashboard' | 'onSettings' | 'onDeleted' |
  'onDiscoveryAvailable' | 'onDiscoveryResult' | 'onDiscoveryAddressChanged'>
type Harness = DeviceMethods & {
  getCapabilityValue: (id: string) => unknown
  setCapabilityValue: (id: string, value: unknown) => Promise<void>
  setCapabilityOptions: (id: string, options: object) => Promise<void>
  capabilityValues: Map<string, unknown>
  capabilityOptions: Map<string, { values: { id: string }[] }>
  capabilityListeners: Map<string, (value: unknown) => Promise<void>>
  settings: Record<string, unknown>
  available: boolean
  unavailableMessage: string | undefined
  connectionManager: EventEmitter & { connectTo: ReturnType<typeof vi.fn>, disconnectFrom: ReturnType<typeof vi.fn> }
}

let homey: FakeHomey
let settings: FakeSettings
let card: (id: string) => FakeCard
let device: Harness
let deck: FakeStreamDeck

const createDevice = (capabilities: Record<string, unknown> = {}) => {
  const Constructor = NetworkDock as unknown as new (homey: FakeHomey, options: object) => Harness
  const result = new Constructor(homey, { settings: { ipAddress: '192.168.1.50' }, data: { id: 'Network Dock ABC' } })
  for (const [key, value] of Object.entries(capabilities)) {
    result.capabilityValues.set(key, value)
  }
  return result
}

/** Emits `connected` and waits until the initial render has touched every key or the whole panel. */
const connect = async (streamDeck: FakeStreamDeck) => {
  device.connectionManager.emit('connected', streamDeck)
  await vi.waitFor(() => {
    const keysTouched = streamDeck.fillKeyBuffer.mock.calls.length + streamDeck.clearKey.mock.calls.length
    expect(keysTouched >= streamDeck.CONTROLS.length || streamDeck.fillPanelBuffer.mock.calls.length > 0).toBe(true)
  }, { timeout: 15_000 })
}

const press = async (event: 'down' | 'up', control: Control) => {
  await device.streamDeckEvent(event, device.getCapabilityValue('onoff') as boolean, control as never)
}

beforeEach(() => {
  const fake = createFakeHomey()
  homey = fake.homey
  settings = fake.settings
  card = fake.card
  seedSettings(settings, {
    images: [{ id: 'img-lamp', name: 'Lamp' }],
    variables: [{ id: 'var-temp', name: 'Temperature', firstLine: '21°', secondLine: 'inside' }],
    dashboards: [
      { id: 'd-home', name: 'Home', items: [
        { type: 'image', item: 1, imageId: 'img-lamp', payload: 'lamp-payload' },
        { type: 'variable', item: 8, variableId: 'var-temp', payload: '' },
      ] },
      { id: 'd-movie', name: 'Movie night' },
    ],
  })
  deck = new FakeStreamDeck(lcdButtons(5, 3))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('onInit', () => {
  it('offers "Homey" plus every dashboard as capability values', async () => {
    device = createDevice({ dashboard: 'd-home' })
    await device.onInit()
    expect(device.capabilityOptions.get('dashboard')?.values.map((value) => value.id)).toEqual(['0', 'd-home', 'd-movie'])
  })

  it('falls back to the Homey dashboard when the selected one no longer exists, after setting the options (regression 8862c09)', async () => {
    device = createDevice({ dashboard: 'deleted' })
    const order: string[] = []
    const setOptions = device.setCapabilityOptions.bind(device)
    const setValue = device.setCapabilityValue.bind(device)
    device.setCapabilityOptions = async (id: string, options: object) => { order.push('options'); await setOptions(id, options) }
    device.setCapabilityValue = async (id: string, value: unknown) => { order.push(`value:${id}`); await setValue(id, value) }

    await device.onInit()

    expect(order).toEqual(['options', 'value:dashboard'])
    expect(device.getCapabilityValue('dashboard')).toBe('0')
    expect(card('changed_dashboard').trigger).toHaveBeenCalledWith(device, { dashboard: 'Homey' })
  })
})

describe('connecting', () => {
  it('stores deck info in the device settings and renders the selected dashboard', async () => {
    device = createDevice({ dashboard: 'd-home', onoff: true })
    await device.onInit()

    await connect(deck)

    expect(device.available).toBe(true)
    expect(device.settings).toMatchObject({ name: 'Stream Deck MK.2', columns: 5, rows: 3, serial: 'SERIAL', firmware: '1.0.0' })
    expect(deck.filledKeys().sort()).toEqual([0, 7])
  })

  it('shows the Homey logo when the Homey dashboard is selected', async () => {
    device = createDevice({ dashboard: '0' })
    await device.onInit()
    await connect(deck)
    expect(deck.fillPanelBuffer).toHaveBeenCalled()
    expect(deck.fillKeyBuffer).not.toHaveBeenCalled()
  })

  it('tolerates failing serial / firmware reads (regression 2a23812)', async () => {
    deck.getSerialNumber.mockRejectedValue(new Error('feature report timeout'))
    deck.getFirmwareVersion.mockRejectedValue(new Error('feature report timeout'))
    device = createDevice({ dashboard: 'd-home' })
    await device.onInit()

    await connect(deck)

    expect(device.available).toBe(true)
    expect(device.settings.serial).toBeUndefined()
    expect(device.settings).toMatchObject({ columns: 5, rows: 3 })
  })

  it('is unavailable when the dock reports no Stream Deck', async () => {
    device = createDevice({ dashboard: '0' })
    await device.onInit()

    device.connectionManager.emit('connected', new FakeStreamDeck([]))
    await vi.waitFor(() => expect(device.available).toBe(false))

    expect(device.unavailableMessage).toBe('No Stream Deck connected to Network Dock')
  })

  it('is unavailable after a disconnect', async () => {
    device = createDevice({ dashboard: '0' })
    await device.onInit()
    await connect(deck)

    deck.tcpEvents.emit('disconnected')
    await vi.waitFor(() => expect(device.available).toBe(false))
    expect(device.unavailableMessage).toBe('Stream Deck Disconnected')
  })

  it('stores the dashboard size when the deck differs from the saved layout', async () => {
    device = createDevice({ dashboard: 'd-home' })
    await device.onInit()
    await connect(new FakeStreamDeck(lcdButtons(8, 4)))
    expect(settings.get('dashboard-d-home')).toMatchObject({ columns: 8, rows: 4 })
  })
})

describe('button events', () => {
  beforeEach(async () => {
    device = createDevice({ dashboard: 'd-home', onoff: true })
    await device.onInit()
    await connect(deck)
  })

  const state = (action: string, extra: object = {}) => ({ action, variableId: '', imageId: '', ...extra })

  it('an image button triggers the image and any-button cards with its tokens', async () => {
    await press('up', deck.CONTROLS[0])

    const tokens = { dashboard: 'Home', imageName: 'Lamp', textFirstLine: '', textSecondLine: '', payload: 'lamp-payload', column: 1, row: 1, item: 'A1' }
    expect(card('image_button_action').trigger).toHaveBeenCalledWith(device, tokens, state('up', { imageId: 'img-lamp' }))
    expect(card('any_button_action').trigger).toHaveBeenCalledWith(device, tokens, state('up', { imageId: 'img-lamp' }))
    expect(card('variable_button_action').trigger).not.toHaveBeenCalled()
  })

  it('a variable button passes its text; item names use a letter per row and a number per column', async () => {
    await press('up', deck.CONTROLS[7])

    const tokens = { dashboard: 'Home', imageName: '', textFirstLine: '21°', textSecondLine: 'inside', payload: '', column: 3, row: 2, item: 'B3' }
    expect(card('variable_button_action').trigger).toHaveBeenCalledWith(device, tokens, state('up', { variableId: 'var-temp' }))
  })

  it('an empty button only triggers the any-button card', async () => {
    await press('up', deck.CONTROLS[14])
    expect(card('any_button_action').trigger).toHaveBeenCalledWith(device, expect.objectContaining({ item: 'C5', payload: '' }), state('up'))
    expect(card('image_button_action').trigger).not.toHaveBeenCalled()
  })

  it('while turned off, only the disabled-button card fires', async () => {
    device.capabilityValues.set('onoff', false)
    await press('down', deck.CONTROLS[0])

    expect(card('off_button_action').trigger).toHaveBeenCalledWith(device, expect.objectContaining({ item: 'A1', column: 1, row: 1 }), state('down'))
    expect(card('any_button_action').trigger).not.toHaveBeenCalled()
  })

  // See TODO.md: off_button_action has an `action` arg but no run listener, so every flow fires on every press/release.
  it.todo('off_button_action only fires flows for the chosen action')

  it('nothing fires on the Homey dashboard', async () => {
    await device.loadDashboard('0')
    await press('up', deck.CONTROLS[0])
    expect(card('any_button_action').trigger).not.toHaveBeenCalled()
  })

  it('reacts to the deck\'s own down/up events for buttons only', async () => {
    deck.emit('up', deck.CONTROLS[0])
    deck.emit('up', { type: 'encoder', index: 0, row: 0, column: 0 })
    await vi.waitFor(() => expect(card('any_button_action').trigger).toHaveBeenCalledTimes(1))
  })

  describe('single and double press', () => {
    const actions = () => card('any_button_action').trigger.mock.calls.map(([, , callState]) => (callState as { action: string }).action)

    beforeEach(() => {
      vi.useFakeTimers()
    })

    it('fires "single" 400 ms after a lone press', async () => {
      await press('down', deck.CONTROLS[0])
      expect(actions()).toEqual(['down'])

      await vi.advanceTimersByTimeAsync(400)
      expect(actions()).toEqual(['down', 'single'])
    })

    it('fires "double" instead of "single" for two presses within 250 ms on the same key', async () => {
      await press('down', deck.CONTROLS[0])
      await vi.advanceTimersByTimeAsync(200)
      await press('down', deck.CONTROLS[0])
      await vi.advanceTimersByTimeAsync(500)

      // 'double' is triggered from inside the second press, before that press's own 'down'.
      expect(actions().sort()).toEqual(['double', 'down', 'down'])
    })

    it('two presses on different keys are two singles', async () => {
      await press('down', deck.CONTROLS[0])
      await vi.advanceTimersByTimeAsync(100)
      await press('down', deck.CONTROLS[1])
      await vi.advanceTimersByTimeAsync(500)

      expect(actions()).toEqual(['down', 'down', 'single', 'single'])
    })
  })
})

describe('dashboard flow cards and capability', () => {
  beforeEach(async () => {
    device = createDevice({ dashboard: 'd-home', onoff: true })
    await device.onInit()
  })

  it('set_dashboard throws while the Stream Deck is unavailable', async () => {
    device.available = false
    await expect(card('set_dashboard').run({ dashboard: { id: 'd-movie', name: 'Movie night' } })).rejects.toBe('Stream Deck is unavailable')
  })

  it('set_dashboard switches, triggers changed_dashboard and renders', async () => {
    await connect(deck)
    deck.fillKeyBuffer.mockClear()
    deck.clearKey.mockClear()

    await card('set_dashboard').run({ dashboard: { id: 'd-movie', name: 'Movie night' } })

    expect(device.getCapabilityValue('dashboard')).toBe('d-movie')
    expect(card('changed_dashboard').trigger).toHaveBeenCalledWith(device, { dashboard: 'Movie night' })
    expect(deck.clearedKeys()).toHaveLength(15)
  })

  it('set_dashboard does nothing when the dashboard is already selected', async () => {
    await card('set_dashboard').run({ dashboard: { id: 'd-home', name: 'Home' } })
    expect(card('changed_dashboard').trigger).not.toHaveBeenCalled()
  })

  it('is_dashboard compares with the selected dashboard', async () => {
    expect(await card('is_dashboard').run({ dashboard: { id: 'd-home' } })).toBe(true)
    expect(await card('is_dashboard').run({ dashboard: { id: 'd-movie' } })).toBe(false)
  })

  it('changing the dashboard capability renders it and triggers changed_dashboard', async () => {
    await connect(deck)
    await device.capabilityListeners.get('dashboard')?.('0')
    expect(deck.fillPanelBuffer).toHaveBeenCalled()
    expect(card('changed_dashboard').trigger).toHaveBeenCalledWith(device, { dashboard: 'Homey' })
  })
})

describe('reacting to settings changes', () => {
  beforeEach(async () => {
    device = createDevice({ dashboard: 'd-home', onoff: true })
    await device.onInit()
    await connect(deck)
    deck.fillKeyBuffer.mockClear()
    deck.clearKey.mockClear()
  })

  it('set-dashboard re-renders the selected dashboard and refreshes the capability values', async () => {
    settings.seed('dashboards', [{ id: 'd-home', name: 'Home' }, { id: 'd-movie', name: 'Movie night' }, { id: 'd-new', name: 'New' }])
    settings.emit('set-dashboard', 'd-home')

    await vi.waitFor(() => expect(deck.fillKeyBuffer.mock.calls.length + deck.clearKey.mock.calls.length).toBe(15))
    expect(device.capabilityOptions.get('dashboard')?.values.map((value) => value.id)).toEqual(['0', 'd-home', 'd-movie', 'd-new'])
  })

  it('unset-dashboard of the selected dashboard falls back to Homey', async () => {
    settings.seed('dashboards', [{ id: 'd-movie', name: 'Movie night' }])
    settings.values.delete('dashboard-d-home')
    settings.emit('unset-dashboard', 'd-home')

    await vi.waitFor(() => expect(device.getCapabilityValue('dashboard')).toBe('0'))
    await vi.waitFor(() => expect(deck.fillPanelBuffer).toHaveBeenCalled())
    expect(card('changed_dashboard').trigger).toHaveBeenCalledWith(device, { dashboard: 'Homey' })
  })

  it('set-variable redraws only the key that shows the variable', async () => {
    settings.seed('variable-var-temp', { firstLine: '22°', secondLine: '', sample: '' })
    settings.emit('set-variable', 'var-temp')

    await vi.waitFor(() => expect(deck.filledKeys()).toEqual([7]))
    expect(deck.clearKey).not.toHaveBeenCalled()
  })

  it('unset-variable clears that key', async () => {
    settings.emit('unset-variable', 'var-temp')
    await vi.waitFor(() => expect(deck.clearedKeys()).toEqual([7]))
  })
})

describe('brightness', () => {
  beforeEach(async () => {
    device = createDevice({ dashboard: '0', onoff: true, dim: 1 })
    await device.onInit()
    await connect(deck)
  })

  it('dim sets the brightness in percent and derives onoff', async () => {
    await device.capabilityListeners.get('dim')?.(0.4)
    expect(deck.setBrightness).toHaveBeenCalledWith(40)
    expect(device.getCapabilityValue('onoff')).toBe(true)

    await device.capabilityListeners.get('dim')?.(0)
    expect(device.getCapabilityValue('onoff')).toBe(false)
  })

  it('onoff sets the brightness to 100 or 0', async () => {
    await device.capabilityListeners.get('onoff')?.(false)
    expect(deck.setBrightness).toHaveBeenLastCalledWith(0)
    await device.capabilityListeners.get('onoff')?.(true)
    expect(deck.setBrightness).toHaveBeenLastCalledWith(100)
  })

  // See TODO.md: the onoff listener writes 0/100 to `dim`, whose range is 0–1.
  it.todo('onoff sets dim to 1 or 0')
})

describe('network', () => {
  beforeEach(async () => {
    device = createDevice({ dashboard: '0' })
    await device.onInit()
  })

  it('connects to the configured ip when discovery finds the dock', async () => {
    await device.onDiscoveryAvailable({ id: 'Network Dock ABC', address: '192.168.1.50' } as never)
    expect(device.connectionManager.connectTo).toHaveBeenCalledWith('192.168.1.50')
  })

  it('matches discovery results on the device id', () => {
    expect(device.onDiscoveryResult({ id: 'Network Dock ABC' } as never)).toBe(true)
    expect(device.onDiscoveryResult({ id: 'Other' } as never)).toBe(false)
  })

  it('stores a changed discovery address in the settings', async () => {
    device.onDiscoveryAddressChanged({ id: 'Network Dock ABC', address: '192.168.1.99' } as never)
    await vi.waitFor(() => expect(device.settings.ipAddress).toBe('192.168.1.99'))
  })

  it('reconnects when the user changes the ip address (73d7d9d)', async () => {
    await connect(deck)
    await device.onSettings({ oldSettings: { ipAddress: '192.168.1.50' }, newSettings: { ipAddress: '192.168.1.60' }, changedKeys: ['ipAddress'] })

    expect(deck.clearPanel).toHaveBeenCalled()
    expect(device.connectionManager.disconnectFrom).toHaveBeenCalledWith('192.168.1.50')
    expect(device.connectionManager.connectTo).toHaveBeenCalledWith('192.168.1.60')
  })

  it('clears the panel and disconnects when deleted', async () => {
    await connect(deck)
    await device.onDeleted()
    expect(deck.clearPanel).toHaveBeenCalled()
    expect(device.connectionManager.disconnectFrom).toHaveBeenCalledWith('192.168.1.50')
  })
})
