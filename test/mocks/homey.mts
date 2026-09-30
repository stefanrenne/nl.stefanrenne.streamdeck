// Stand-in for the `homey` module, which only exists inside the Homey runtime.
// Aliased in vitest.config.mjs. Only the parts the app, driver and device use are implemented.

class App {
  homey: unknown

  constructor(homey: unknown) {
    this.homey = homey
  }

  log(...args: unknown[]) {}

  error(...args: unknown[]) {}
}

type CapabilityListener = (value: unknown) => Promise<void>

class Device {
  homey: unknown
  capabilityValues = new Map<string, unknown>()
  capabilityOptions = new Map<string, unknown>()
  capabilityListeners = new Map<string, CapabilityListener>()
  settings: Record<string, unknown>
  data: Record<string, unknown>
  available = true
  unavailableMessage: string | undefined

  constructor(homey: unknown, options: { settings?: Record<string, unknown>, data?: Record<string, unknown> } = {}) {
    this.homey = homey
    this.settings = { ...options.settings }
    this.data = { id: 'dock', ...options.data }
  }

  // Like Homey: a capability that was never set reads as null.
  getCapabilityValue(id: string) {
    return this.capabilityValues.has(id) ? this.capabilityValues.get(id) : null
  }

  async setCapabilityValue(id: string, value: unknown) {
    this.capabilityValues.set(id, value)
  }

  async setCapabilityOptions(id: string, options: unknown) {
    this.capabilityOptions.set(id, options)
  }

  registerCapabilityListener(id: string, listener: CapabilityListener) {
    this.capabilityListeners.set(id, listener)
  }

  async setAvailable() {
    this.available = true
    this.unavailableMessage = undefined
  }

  async setUnavailable(message?: string) {
    this.available = false
    this.unavailableMessage = message
  }

  getAvailable() {
    return this.available
  }

  async setSettings(settings: Record<string, unknown>) {
    Object.assign(this.settings, settings)
  }

  getSetting(key: string) {
    return this.settings[key]
  }

  getSettings() {
    return this.settings
  }

  getData() {
    return this.data
  }

  log(...args: unknown[]) {}

  error(...args: unknown[]) {}
}

class Driver {
  homey: unknown
  discoveryResults: Record<string, unknown> = {}

  constructor(homey: unknown) {
    this.homey = homey
  }

  getDiscoveryStrategy() {
    return { getDiscoveryResults: () => this.discoveryResults }
  }

  log(...args: unknown[]) {}

  error(...args: unknown[]) {}
}

export default { App, Device, Driver }
