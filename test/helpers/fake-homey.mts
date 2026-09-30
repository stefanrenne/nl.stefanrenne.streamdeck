import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { vi } from 'vitest'
import { Store } from '../../lib/storage.mjs'

type Args = Record<string, unknown>
type AutocompleteListener = (query: string) => unknown
type RunListener = (args: Args, state?: Args) => unknown

// The generated manifest, so the tests see the same flow cards as the runtime.
export const manifest = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'))

/** Records everything the app, device and CardListener register on a flow card. */
export class FakeCard {
  id: string
  runListener?: RunListener
  autocompleteListeners = new Map<string, AutocompleteListener>()
  trigger = vi.fn(async (...args: unknown[]) => undefined)

  constructor(id: string) {
    this.id = id
  }

  registerRunListener(listener: RunListener) {
    this.runListener = listener
    return this
  }

  registerArgumentAutocompleteListener(name: string, listener: AutocompleteListener) {
    this.autocompleteListeners.set(name, listener)
    return this
  }

  async run(args: Args, state?: Args) {
    if (this.runListener === undefined) {
      throw new Error(`No run listener registered for ${this.id}`)
    }
    return this.runListener(args, state)
  }

  async autocomplete(arg: string, query: string) {
    const listener = this.autocompleteListeners.get(arg)
    if (listener === undefined) {
      throw new Error(`No ${arg} autocomplete registered for ${this.id}`)
    }
    return listener(query)
  }
}

/**
 * In-memory `homey.settings`. Like Homey it emits `set` / `unset` with the key,
 * and it is also used as a plain EventEmitter for the app's `set-image`, `set-dashboard`… relay.
 */
export class FakeSettings extends EventEmitter {
  values = new Map<string, unknown>()

  get(key: string) {
    // Unknown keys read as undefined: lib/storage.mts compares with `=== undefined` throughout.
    // Whether the real runtime returns undefined or null is an open question (see TODO.md).
    return this.values.has(key) ? structuredClone(this.values.get(key)) : undefined
  }

  set(key: string, value: unknown) {
    this.values.set(key, structuredClone(value))
    this.emit('set', key)
  }

  unset(key: string) {
    this.values.delete(key)
    this.emit('unset', key)
  }

  getKeys() {
    return [...this.values.keys()]
  }

  /** Seed a value without emitting `set`. */
  seed(key: string, value: unknown) {
    this.values.set(key, structuredClone(value))
  }
}

export function createFakeHomey() {
  const cards = new Map<string, FakeCard>()
  const card = (id: string): FakeCard => {
    let result = cards.get(id)
    if (result === undefined) {
      result = new FakeCard(id)
      cards.set(id, result)
    }
    return result
  }
  const settings = new FakeSettings()

  const homey = {
    manifest,
    settings,
    flow: { getActionCard: card, getConditionCard: card, getTriggerCard: card, getDeviceTriggerCard: card },
    __: (key: string) => key,
    log: vi.fn(),
    error: vi.fn(),
  }

  return { homey, card, cards, settings }
}

export type FakeHomey = ReturnType<typeof createFakeHomey>['homey']

export function createStore(homey: FakeHomey): Store {
  return new Store(homey as unknown as ConstructorParameters<typeof Store>[0])
}

// A 2x2 red PNG as a data URL, the format the settings page stores images in.
export const RED_PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAE0lEQVR4AWP8z8DwnwEImBigAAAfFwICgH3ifwAAAABJRU5ErkJggg=='

/** Seeds the settings the same way the settings page writes them. */
export function seedSettings(settings: FakeSettings, data: {
  images?: { id: string, name: string, data?: string }[]
  variables?: { id: string, name: string, firstLine?: string, secondLine?: string, textColor?: string, backgroundColor?: string, sample?: string }[]
  dashboards?: { id: string, name: string, columns?: number, rows?: number, items?: Record<string, unknown>[] }[]
}) {
  if (data.images) {
    settings.seed('images', data.images.map(({ id, name }) => ({ id, name })))
    for (const image of data.images) {
      settings.seed('image-' + image.id, image.data ?? RED_PIXEL_PNG)
    }
  }
  if (data.variables) {
    settings.seed('variables', data.variables.map(({ id, name }) => ({ id, name })))
    for (const { id, name, ...variable } of data.variables) {
      settings.seed('variable-' + id, { firstLine: '', secondLine: '', sample: 'data:image/jpeg;base64,', ...variable })
    }
  }
  if (data.dashboards) {
    settings.seed('dashboards', data.dashboards.map(({ id, name }) => ({ id, name })))
    for (const dashboard of data.dashboards) {
      settings.seed('dashboard-' + dashboard.id, { columns: dashboard.columns ?? 5, rows: dashboard.rows ?? 3, items: dashboard.items ?? [] })
    }
  }
}
