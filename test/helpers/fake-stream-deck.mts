import { EventEmitter } from 'node:events'
import { vi } from 'vitest'

type Control = {
  type: string
  index: number
  row: number
  column: number
  feedbackType?: string
  pixelSize?: { width: number, height: number }
}

/** LCD button controls laid out like a real deck (index = row * columns + column). */
export function lcdButtons(columns: number, rows: number, pixelSize = 72): Control[] {
  return Array.from({ length: columns * rows }, (_, index) => ({
    type: 'button',
    index,
    row: Math.floor(index / columns),
    column: index % columns,
    feedbackType: 'lcd',
    pixelSize: { width: pixelSize, height: pixelSize },
  }))
}

/** The Stream Deck Neo: 8 LCD buttons plus two RGB touch buttons and an LCD segment on row 2. */
export function neoControls(): Control[] {
  return [
    ...lcdButtons(4, 2, 96),
    { type: 'button', index: 8, row: 2, column: 0, feedbackType: 'rgb' },
    { type: 'lcd-segment', index: 0, row: 2, column: 1 },
    { type: 'button', index: 9, row: 2, column: 3, feedbackType: 'rgb' },
  ]
}

/** Records every call the adapter and device make on a StreamDeckTcp. */
export class FakeStreamDeck extends EventEmitter {
  CONTROLS: Control[]
  PRODUCT_NAME = 'Stream Deck MK.2'
  remoteAddress = '192.168.1.50'
  tcpEvents = new EventEmitter()
  panelDimensions: { width: number, height: number } | null = { width: 480, height: 272 }

  fillKeyBuffer = vi.fn(async (index: number, buffer: Buffer, options: unknown) => undefined)
  clearKey = vi.fn(async (index: number) => undefined)
  clearPanel = vi.fn(async () => undefined)
  fillPanelBuffer = vi.fn(async (buffer: Buffer, options: unknown) => undefined)
  setBrightness = vi.fn(async (percentage: number) => undefined)
  getSerialNumber = vi.fn(async () => 'SERIAL')
  getFirmwareVersion = vi.fn(async () => '1.0.0')

  constructor(controls: Control[] = lcdButtons(5, 3)) {
    super()
    this.CONTROLS = controls
  }

  calculateFillPanelDimensions() {
    return this.panelDimensions
  }

  /** The key indexes that received an image, in call order. */
  filledKeys() {
    return this.fillKeyBuffer.mock.calls.map(([index]) => index)
  }

  clearedKeys() {
    return this.clearKey.mock.calls.map(([index]) => index)
  }
}
