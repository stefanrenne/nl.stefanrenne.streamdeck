'use strict';

import type { StreamDeckButtonControlDefinitionLcdFeedback } from '@elgato-stream-deck/core'
import { StreamDeckTcp } from '@elgato-stream-deck/tcp'
import { Jimp } from 'jimp';
import path from 'path';
import { TextToImage } from './textToImage.mjs';
import { Dashboard } from './storage.mjs';

export function getButtonControlSize(streamDeck: StreamDeckTcp) {
    return streamDeck.CONTROLS.reduce((result, control) => {
        if (control as StreamDeckButtonControlDefinitionLcdFeedback) {
            if (result.columns < (control.column + 1)) {
            result.columns = control.column + 1
            result.total = result.rows * result.columns;
            }
            if (result.rows < (control.row + 1)) {
            result.rows = control.row + 1
            result.total = result.rows * result.columns;
            }
        }
        return result
        }, {columns: 0, rows: 0, total: 0});
}

export async function renderText(streamDeck: StreamDeckTcp, control: StreamDeckButtonControlDefinitionLcdFeedback, firstLine: string, secondLine: string | undefined, textColor: string, backgroundColor: string) {
    const image = await TextToImage.create(control.pixelSize.width, firstLine, secondLine, textColor, backgroundColor);
    await streamDeck.fillKeyBuffer(control.index, image.bitmap.data, { format: 'rgba' });
}

export async function renderImage(streamDeck: StreamDeckTcp, control: StreamDeckButtonControlDefinitionLcdFeedback, imageBuffer: Buffer) {
    const image = await Jimp.fromBuffer(imageBuffer).then((jimp) => {
        return jimp.resize({ w: control.pixelSize.width, h: control.pixelSize.height });
    });
    await streamDeck.fillKeyBuffer(control.index, image.bitmap.data, { format: 'rgba' });
}

export async function renderDashboard(streamDeck: StreamDeckTcp, dashboard: Dashboard) {
    const controls = streamDeck.CONTROLS.map((control) => control as StreamDeckButtonControlDefinitionLcdFeedback)

    const actions: Promise<void>[] = []
    for (const [i, control] of controls.entries()) {
        const item = dashboard.items[i+1];
        switch (item?.kind) {
        case 'variable':
        actions.push(renderText(streamDeck, control, item.firstLine, item.secondLine, item.textColor, item.backgroundColor).catch((e) => console.error('renderImage failed:', e)));
        break;
        case 'image':
        actions.push(renderImage(streamDeck, control, item.imageBuffer).catch((e) => console.error('renderImage failed:', e)));
        break;
        default:
        actions.push(streamDeck.clearKey(control.index).catch((e) => console.error('clearKey failed:', e)));
        }
    }
    await Promise.all(actions);
}

export async function renderPincodeDashboard(streamDeck: StreamDeckTcp) {
    // Validate if the loaded dashboard has the correct number of buttons (6, 15 or 32)
    const size = getButtonControlSize(streamDeck);
    if (size.columns >= 3 && size.rows >= 3) {
        return
    }

    const startColumnOffset = Math.floor((size.columns-3)/2);
    const startRowOffset = Math.ceil((size.rows-3)/2);
            
    const items: { [item: number]: number | undefined; } = [];
    let number = 0;
    for (let i = 0; i < size.total; i++) {
        const column = (i % size.columns) + 1;
        const row = Math.floor(i / size.rows) + 1;      
        if ([1,2,3].includes(row-startRowOffset) && [1,2,3].includes(column-startColumnOffset)) {
        number += 1;
        items[i+1] = number;
        } else {
        items[i+1] = undefined;
        }
    }

    const controls = streamDeck.CONTROLS.map((control) => control as StreamDeckButtonControlDefinitionLcdFeedback)
    const actions: Promise<void>[] = []
    for (const [i, control] of controls.entries()) {
        const item = items[i+1];
        if (item === undefined) {
        actions.push(streamDeck.clearKey(control.index).catch((e) => console.error('clearKey failed:', e)));
        } else {
        actions.push(renderText(streamDeck, control, item.toString(), undefined, "#ffffff", "#000000").catch((e) => console.error('renderText failed:', e)));
        }
    }
    await Promise.all(actions);
}

export async function renderHomeyLogo(streamDeck: StreamDeckTcp) {
    const panelDimensions = streamDeck.calculateFillPanelDimensions();
    if (panelDimensions === null) {
    await streamDeck?.clearPanel();
    return
    }
    
    const padding: number = 50
    const image = await Jimp.read(path.resolve(__dirname, '../assets/homey-logo.png')).then((jimp) => {
    return jimp.scaleToFit({ w: panelDimensions.width - (padding * 2), h: panelDimensions.height - (padding * 2) })
    });
    
    const background = new Jimp({ width: panelDimensions.width, height: panelDimensions.height })
    .blit({ src: image, x: (panelDimensions.width - image.width) / 2, y: (panelDimensions.height - image.height) / 2 });

    await streamDeck.fillPanelBuffer(background.bitmap.data, { format: 'rgba' }).catch((e) => console.error('fillPanelBuffer failed:', e));
}