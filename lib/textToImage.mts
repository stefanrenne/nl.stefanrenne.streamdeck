'use strict';

import { Jimp, loadFont, HorizontalAlign, VerticalAlign, measureText, measureTextHeight } from 'jimp';
import * as Font from "jimp/fonts";

export class TextToImage {

    static sampleSize = 192;

    static async create(maxSize: number, firstLine: string, secondLine: string | undefined, textColor: string, backgroundColor: string) {

        const textPadding = 2;
        const dualtextLineHeight = maxSize / 2;
        const maxHeight = (secondLine === undefined) ? maxSize : dualtextLineHeight - (textPadding / 2);
        const maxWidth = maxSize - (2 * textPadding);

        const image = new Jimp({ width: maxSize, height: maxSize, color: backgroundColor });

        // calculate max fonts
        const textLine1Font = await TextToImage.getFont(firstLine, maxHeight, maxWidth);
        const textLine1Height = measureTextHeight(textLine1Font, firstLine, maxWidth);
        const textLine2Font = (secondLine === undefined) ? undefined : await TextToImage.getFont(secondLine, maxHeight, maxWidth);
        const textLine2Height = (secondLine === undefined || textLine2Font === undefined) ? undefined :  measureTextHeight(textLine2Font, secondLine, maxWidth);

        // calculate y offset to center content
        const textHeight = (textLine2Height === undefined) ? textLine1Height : textLine1Height + textLine2Height + textPadding;
        const yStart = (maxSize - textHeight) / 2;

        // text textLine 1
        const textLine1 = new Jimp({ width: maxSize, height: maxSize, color: 0x0 });
        textLine1.print({ font: textLine1Font, x: 0, y: yStart, text: { text: firstLine, alignmentX: HorizontalAlign.CENTER, alignmentY: VerticalAlign.TOP }, maxHeight: maxSize, maxWidth: maxSize });
        textLine1.color([{ apply: 'xor', params: [TextToImage.hex2rgb(textColor)] }]);
        image.blit(textLine1);

        if (secondLine !== undefined && textLine2Font !== undefined) {
            // text textLine 2
            const textLine2 = new Jimp({ width: maxSize, height: maxSize, color: 0x0 });
            textLine2.print({ font: textLine2Font, x: 0, y: yStart + textPadding + textLine1Height, text: { text: secondLine, alignmentX: HorizontalAlign.CENTER, alignmentY: VerticalAlign.TOP }, maxHeight: maxSize, maxWidth: maxSize });
            textLine2.color([{ apply: 'xor', params: [TextToImage.hex2rgb(textColor)] }]);
            image.blit(textLine2);
        }

        return image;
    }

    private static async getFont(text: string, maxHeight: number, maxWidth: number) {
        const font128 = await loadFont(Font.SANS_128_BLACK);
        if (measureText(font128, text) < maxWidth && measureTextHeight(font128, text, maxWidth) < maxHeight) {
            return font128
        }

        const font64 = await loadFont(Font.SANS_64_BLACK);
        if (measureText(font64, text) < maxWidth && measureTextHeight(font64, text, maxWidth) < maxHeight) {
            return font64
        }

        const font32 = await loadFont(Font.SANS_32_BLACK);
        if (measureText(font32, text) < maxWidth && measureTextHeight(font32, text, maxWidth) < maxHeight) {
            return font32
        }

        const font16 = await loadFont(Font.SANS_16_BLACK);
        if (measureText(font16, text) < maxWidth && measureTextHeight(font16, text, maxWidth) < maxHeight) {
            return font16
        }

        return await loadFont(Font.SANS_8_BLACK);
    }

    private static hex2rgb(hex: string) {
        const r = (hex.length === 4) ? parseInt(hex.slice(1, 2) + hex.slice(1, 2), 16) : parseInt(hex.slice(1, 3), 16);
        const g = (hex.length === 4) ? parseInt(hex.slice(2, 3) + hex.slice(2, 3), 16)  : parseInt(hex.slice(3, 5), 16);
        const b = (hex.length === 4) ? parseInt(hex.slice(3, 4) + hex.slice(3, 4), 16)  : parseInt(hex.slice(5, 7), 16);
        return { r: r, g: g, b: b };
    }
}