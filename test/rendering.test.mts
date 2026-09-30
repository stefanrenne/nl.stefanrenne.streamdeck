import { describe, expect, it } from 'vitest'
import { intToRGBA } from 'jimp'
import { TextToImage } from '../lib/textToImage.mjs'
import { getButtonControlSize, renderDashboard, renderHomeyLogo } from '../lib/streamDeckAdapter.mjs'
import type { Dashboard, DashboardItem } from '../lib/storage.mjs'
import { FakeStreamDeck, lcdButtons, neoControls } from './helpers/fake-stream-deck.mjs'

type Deck = Parameters<typeof renderDashboard>[0]
const asDeck = (deck: FakeStreamDeck) => deck as unknown as Deck

describe('TextToImage', () => {
  it('renders a square image of the requested size on the background colour', async () => {
    const image = await TextToImage.create(72, 'Hi', undefined, '#ffffff', '#0000ff')

    expect([image.width, image.height]).toEqual([72, 72])
    expect(intToRGBA(image.getPixelColor(0, 0))).toMatchObject({ r: 0, g: 0, b: 255 })
  })

  it('draws the text in the text colour, for both lines', async () => {
    const image = await TextToImage.create(TextToImage.sampleSize, 'Hello', 'World', '#ff0000', '#000000')
    const colours = new Set<number>()
    image.scan((x, y) => {
      colours.add(image.getPixelColor(x, y))
    })
    const reds = [...colours].map(intToRGBA).filter(({ r, g, b }) => r > 200 && g < 60 && b < 60)
    expect(reds.length).toBeGreaterThan(0)
  })

  it('accepts short #rgb colours', async () => {
    const image = await TextToImage.create(32, 'A', undefined, '#f00', '#000')
    expect(intToRGBA(image.getPixelColor(0, 0))).toMatchObject({ r: 0, g: 0, b: 0 })
  })
})

describe('getButtonControlSize', () => {
  it.each([[8, 4], [5, 3], [4, 2], [3, 2]])('derives %ix%i from the LCD button grid', (columns, rows) => {
    expect(getButtonControlSize(asDeck(new FakeStreamDeck(lcdButtons(columns, rows))))).toEqual({ columns, rows, total: columns * rows })
  })

  // See TODO.md: `control as X` is a cast, not a type check, so the Neo's RGB buttons and LCD segment count as a third row.
  it.todo('ignores non-LCD controls, so a Stream Deck Neo is 4x2')

  it('currently reports the Neo as 4x3 (documents the bug above)', () => {
    expect(getButtonControlSize(asDeck(new FakeStreamDeck(neoControls())))).toMatchObject({ columns: 4, rows: 3 })
  })
})

describe('renderDashboard', () => {
  const dashboardWith = (items: Record<number, DashboardItem>): Dashboard => ({
    id: 'd', name: 'Home', columns: 5, rows: 3, usedVariableIds: [], items,
  })

  it('draws images and variables on their key and clears every other key', async () => {
    const deck = new FakeStreamDeck(lcdButtons(5, 3))
    const imageBuffer = await TextToImage.create(10, 'x', undefined, '#fff', '#000').then((image) => image.getBuffer('image/png'))

    await renderDashboard(asDeck(deck), dashboardWith({
      1: { kind: 'image', name: 'Lamp', payload: '', imageId: 'img', imageBuffer },
      3: { kind: 'variable', name: 'Temp', payload: '', variableId: 'v', firstLine: '21°', secondLine: undefined, textColor: '#fff', backgroundColor: '#000' },
      2: { kind: 'empty', payload: '' },
    }))

    expect(deck.filledKeys().sort()).toEqual([0, 2])
    expect(deck.clearedKeys().sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    for (const [, buffer, options] of deck.fillKeyBuffer.mock.calls) {
      expect(buffer.length).toBe(72 * 72 * 4)
      expect(options).toEqual({ format: 'rgba' })
    }
  })

  it('keeps going when one key fails to render', async () => {
    const deck = new FakeStreamDeck(lcdButtons(3, 2))
    deck.clearKey.mockRejectedValueOnce(new Error('tcp timeout'))

    await expect(renderDashboard(asDeck(deck), dashboardWith({}))).resolves.toBeUndefined()
    expect(deck.clearKey).toHaveBeenCalledTimes(6)
  })
})

describe('renderHomeyLogo', () => {
  it('fills the whole panel with the logo (regression 345f453: __dirname in ESM)', async () => {
    const deck = new FakeStreamDeck()

    await renderHomeyLogo(asDeck(deck))

    const [buffer] = deck.fillPanelBuffer.mock.calls[0]
    expect(buffer.length).toBe(480 * 272 * 4)
  })

  it('clears the panel when the deck cannot be filled as one panel', async () => {
    const deck = new FakeStreamDeck()
    deck.panelDimensions = null

    await renderHomeyLogo(asDeck(deck))

    expect(deck.clearPanel).toHaveBeenCalled()
    expect(deck.fillPanelBuffer).not.toHaveBeenCalled()
  })
})
