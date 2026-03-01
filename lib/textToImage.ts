'use strict';

import Homey from 'homey/lib/Homey';
import { Jimp, loadFont, HorizontalAlign, VerticalAlign, measureText, measureTextHeight } from 'jimp';
import * as Font from "jimp/fonts";

export class TextToImage {

    static sampleSize = 192;

    static async create(maxSize: number, firstLine: string, secondLine: string | undefined) {

        const textPadding = 2;
        const dualtextLineHeight = maxSize / 2;
        const maxHeight = (secondLine === undefined) ? maxSize : dualtextLineHeight - (textPadding / 2);
        const maxWidth = maxSize - (2 * textPadding);

        const image = new Jimp({ width: maxSize, height: maxSize });

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
        image.blit(textLine1);

        if (secondLine !== undefined && textLine2Font !== undefined) {
            // text textLine 2
            const textLine2 = new Jimp({ width: maxSize, height: maxSize, color: 0x0 });
            textLine2.print({ font: textLine2Font, x: 0, y: yStart + textPadding + textLine1Height, text: { text: secondLine, alignmentX: HorizontalAlign.CENTER, alignmentY: VerticalAlign.TOP }, maxHeight: maxSize, maxWidth: maxSize });
            image.blit(textLine2);
        }

        return image;
    }

    private static async getFont(text: string, maxHeight: number, maxWidth: number) {
        const font128 = await loadFont(Font.SANS_128_WHITE);
        if (measureText(font128, text) < maxWidth && measureTextHeight(font128, text, maxWidth) < maxHeight) {
            return font128
        }

        const font64 = await loadFont(Font.SANS_64_WHITE);
        if (measureText(font64, text) < maxWidth && measureTextHeight(font64, text, maxWidth) < maxHeight) {
            return font64
        }

        const font32 = await loadFont(Font.SANS_32_WHITE);
        if (measureText(font32, text) < maxWidth && measureTextHeight(font32, text, maxWidth) < maxHeight) {
            return font32
        }

        const font16 = await loadFont(Font.SANS_16_WHITE);
        if (measureText(font16, text) < maxWidth && measureTextHeight(font16, text, maxWidth) < maxHeight) {
            return font16
        }

        return await loadFont(Font.SANS_8_WHITE);
    }
}