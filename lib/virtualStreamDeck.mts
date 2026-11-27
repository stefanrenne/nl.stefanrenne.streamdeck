'use strict';

import { EventEmitter } from 'node:events';
import type { Dimension, FillImageOptions, StreamDeckButtonControlDefinitionLcdFeedback } from '@elgato-stream-deck/core'
import { Jimp } from 'jimp';
import { DeckSurface } from './streamDeckAdapter.mjs';

/** The real Stream Deck models a virtual deck can imitate: the LCD key grid and key size of each. */
export const VIRTUAL_DECK_MODELS = {
    mini: { name: 'Stream Deck Mini', columns: 3, rows: 2, pixelSize: 80 },
    neo: { name: 'Stream Deck Neo', columns: 4, rows: 2, pixelSize: 96 },
    plus: { name: 'Stream Deck +', columns: 4, rows: 2, pixelSize: 120 },
    mk2: { name: 'Stream Deck MK.2', columns: 5, rows: 3, pixelSize: 72 },
    xl: { name: 'Stream Deck XL', columns: 8, rows: 4, pixelSize: 96 },
} as const;

export type VirtualDeckModelId = keyof typeof VIRTUAL_DECK_MODELS;

export function isVirtualDeckModelId(value: unknown): value is VirtualDeckModelId {
    return typeof value === 'string' && Object.hasOwn(VIRTUAL_DECK_MODELS, value);
}

/** What a widget needs to draw the deck. A key is a JPEG data URL, or null when it's black. */
export type VirtualDeckState = {
    model: VirtualDeckModelId,
    name: string,
    columns: number,
    rows: number,
    keys: (string | null)[],
    brightness: number,
};

export type VirtualDeckEvents = {
    key: [index: number, image: string | null],
    brightness: [percentage: number],
    down: [control: StreamDeckButtonControlDefinitionLcdFeedback],
    up: [control: StreamDeckButtonControlDefinitionLcdFeedback],
};

/**
 * A Stream Deck without hardware: it keeps the image of every key and the brightness, emits `key`
 * and `brightness` when they change, and emits `down`/`up` like a real deck when `press` is called.
 */
export class VirtualStreamDeck extends EventEmitter<VirtualDeckEvents> implements DeckSurface {

    readonly MODEL: VirtualDeckModelId;
    readonly PRODUCT_NAME: string;
    readonly CONTROLS: Readonly<StreamDeckButtonControlDefinitionLcdFeedback[]>;

    private keys: (string | null)[];
    // Encoding is async, so a newer clear or fill of the same key may finish first. Only the latest call per key is kept.
    private keyVersions: number[];
    private brightness = 100;

    constructor(model: VirtualDeckModelId) {
        super();
        const { name, columns, rows, pixelSize } = VIRTUAL_DECK_MODELS[model];
        this.MODEL = model;
        this.PRODUCT_NAME = name;
        this.CONTROLS = Array.from({ length: columns * rows }, (_, index) => {
            const row = Math.floor(index / columns);
            const column = index % columns;
            return {
                id: index,
                type: 'button' as const,
                index,
                hidIndex: index,
                row,
                column,
                bounds: { x: column * pixelSize, y: row * pixelSize, width: pixelSize, height: pixelSize },
                feedbackType: 'lcd' as const,
                pixelSize: { width: pixelSize, height: pixelSize },
            };
        });
        this.keys = this.CONTROLS.map(() => null);
        this.keyVersions = this.CONTROLS.map(() => 0);
    }

    getState(): VirtualDeckState {
        const { name, columns, rows } = VIRTUAL_DECK_MODELS[this.MODEL];
        return { model: this.MODEL, name, columns, rows, keys: [...this.keys], brightness: this.brightness };
    }

    /** Presses (`down`) or releases (`up`) a key, as if it happened on a real deck. */
    press(index: number, action: 'down' | 'up') {
        const control = this.control(index);
        this.emit(action, control);
    }

    async fillKeyBuffer(index: number, imageBuffer: Uint8Array | Uint8ClampedArray, options?: FillImageOptions): Promise<void> {
        const control = this.control(index);
        const version = ++this.keyVersions[index];
        const { width, height } = control.pixelSize;
        const data = toRgba(imageBuffer, options?.format ?? 'rgb', width * height);
        const image = await Jimp.fromBitmap({ width, height, data }).getBase64('image/jpeg', { quality: 90 });
        if (version === this.keyVersions[index]) {
            this.setKey(index, image);
        }
    }

    async clearKey(index: number): Promise<void> {
        this.control(index);
        this.keyVersions[index]++;
        this.setKey(index, null);
    }

    async clearPanel(): Promise<void> {
        await Promise.all(this.CONTROLS.map((control) => this.clearKey(control.index)));
    }

    /** The keys sit edge to edge: a virtual deck has no bezel between them. */
    calculateFillPanelDimensions(): Dimension | null {
        const { columns, rows, pixelSize } = VIRTUAL_DECK_MODELS[this.MODEL];
        return { width: columns * pixelSize, height: rows * pixelSize };
    }

    /** Cuts the panel image into keys. */
    async fillPanelBuffer(imageBuffer: Uint8Array | Uint8ClampedArray, options?: FillImageOptions): Promise<void> {
        const { columns, rows, pixelSize } = VIRTUAL_DECK_MODELS[this.MODEL];
        const panel = toRgba(imageBuffer, options?.format ?? 'rgb', columns * pixelSize * rows * pixelSize);
        const panelRow = columns * pixelSize * 4;
        const keyRow = pixelSize * 4;

        await Promise.all(this.CONTROLS.map((control) => {
            const key = Buffer.alloc(keyRow * pixelSize);
            for (let y = 0; y < pixelSize; y++) {
                const start = (control.row * pixelSize + y) * panelRow + control.column * keyRow;
                panel.copy(key, y * keyRow, start, start + keyRow);
            }
            return this.fillKeyBuffer(control.index, key, { format: 'rgba' });
        }));
    }

    async setBrightness(percentage: number): Promise<void> {
        this.brightness = Math.min(100, Math.max(0, Math.round(percentage)));
        this.emit('brightness', this.brightness);
    }

    private control(index: number) {
        const control = this.CONTROLS[index];
        if (!Number.isInteger(index) || control === undefined) {
            throw new TypeError(`Expected a valid key index, got ${index}`);
        }
        return control;
    }

    private setKey(index: number, image: string | null) {
        this.keys[index] = image;
        this.emit('key', index, image);
    }
}

/** Converts a `format` pixel buffer to RGBA, as the deck library accepts the same formats. */
function toRgba(buffer: Uint8Array | Uint8ClampedArray, format: FillImageOptions['format'], pixels: number): Buffer {
    const channels = format.length;
    if (buffer.length !== pixels * channels) {
        throw new RangeError(`Expected image buffer of length ${pixels * channels}, got length ${buffer.length}`);
    }
    if (format === 'rgba') {
        return Buffer.from(buffer);
    }
    const [r, g, b] = format.startsWith('bgr') ? [2, 1, 0] : [0, 1, 2];
    const result = Buffer.alloc(pixels * 4);
    for (let i = 0; i < pixels; i++) {
        result[i * 4] = buffer[i * channels + r];
        result[i * 4 + 1] = buffer[i * channels + g];
        result[i * 4 + 2] = buffer[i * channels + b];
        result[i * 4 + 3] = channels === 4 ? buffer[i * channels + 3] : 255;
    }
    return result;
}
