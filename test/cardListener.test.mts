import { beforeEach, describe, expect, it } from 'vitest'
import { CardListener } from '../lib/cardListener.mjs'
import { createFakeHomey, createStore, FakeCard, RED_PIXEL_PNG, seedSettings } from './helpers/fake-homey.mjs'

let listener: CardListener
let card: FakeCard

beforeEach(() => {
  const fake = createFakeHomey()
  seedSettings(fake.settings, {
    images: [{ id: 'img-lamp', name: 'Lamp' }, { id: 'img-tv', name: 'TV' }],
    variables: [{ id: 'var-temp', name: 'Temperature', sample: 'sample-data' }],
    dashboards: [{ id: 'd-home', name: 'Home' }, { id: 'd-movie', name: 'Movie night' }],
  })
  const store = createStore(fake.homey)
  listener = new CardListener(fake.homey as unknown as ConstructorParameters<typeof CardListener>[0], store)
  card = new FakeCard('card')
})

type Register = (card: never) => void
const register = (method: Register) => method.call(listener, card as never)

describe('autocomplete', () => {
  it('images: filters case-insensitively and includes the image as preview', async () => {
    register(listener.registerImageAutocompleteListenerForCard)
    expect(await card.autocomplete('image', 'lA')).toEqual([{ id: 'img-lamp', name: 'Lamp', description: '', image: RED_PIXEL_PNG }])
    expect(await card.autocomplete('image', '')).toHaveLength(2)
  })

  it('variables: includes the rendered sample as preview', async () => {
    register(listener.registerVariableAutocompleteListenerForCard)
    expect(await card.autocomplete('variable', 'temp')).toEqual([{ id: 'var-temp', name: 'Temperature', description: '', image: 'sample-data' }])
  })

  it('dashboards: always offers the "Homey" logo dashboard (id 0) first', async () => {
    register(listener.registerDashboardAutocompleteListenerForCard)
    expect((await card.autocomplete('dashboard', '') as { id: string }[]).map((option) => option.id)).toEqual(['0', 'd-home', 'd-movie'])
    expect(await card.autocomplete('dashboard', 'movie')).toEqual([{ id: 'd-movie', name: 'Movie night', description: '', image: '' }])
    expect((await card.autocomplete('dashboard', 'hom') as { id: string }[]).map((option) => option.id)).toEqual(['0', 'd-home'])
  })
})

describe('run listeners', () => {
  it('image button: matches on image id and action', async () => {
    register(listener.registerImageButtonRunListener)
    const args = { image: { id: 'img-lamp' }, action: 'single' }
    expect(await card.run(args, { action: 'single', imageId: 'img-lamp', variableId: '' })).toBe(true)
    expect(await card.run(args, { action: 'double', imageId: 'img-lamp', variableId: '' })).toBe(false)
    expect(await card.run(args, { action: 'single', imageId: 'img-tv', variableId: '' })).toBe(false)
  })

  it('variable button: matches on variable id and action', async () => {
    register(listener.registerVariableButtonRunListener)
    const args = { variable: { id: 'var-temp' }, action: 'down' }
    expect(await card.run(args, { action: 'down', imageId: '', variableId: 'var-temp' })).toBe(true)
    expect(await card.run(args, { action: 'up', imageId: '', variableId: 'var-temp' })).toBe(false)
  })

  it('any button: matches on action only', async () => {
    register(listener.registerAnyButtonRunListener)
    expect(await card.run({ action: 'up' }, { action: 'up', imageId: 'x', variableId: '' })).toBe(true)
    expect(await card.run({ action: 'up' }, { action: 'down', imageId: 'x', variableId: '' })).toBe(false)
  })
})
