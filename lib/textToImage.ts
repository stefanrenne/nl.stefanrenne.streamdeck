'use strict';

import Homey from 'homey/lib/Homey';
import { Jimp, loadFont, HorizontalAlign, VerticalAlign, measureText } from 'jimp';
import * as Font from "jimp/fonts";

export class TextToImage {

    static async create(maxSize: number, firstLine: string, secondLine: string | undefined) {

        const textPadding = 2;
        const dualtextLineHeight = maxSize / 2;

        const image = new Jimp({ width: maxSize, height: maxSize });

        // text textLine 1
        const textLine1Font = await TextToImage.getFont(firstLine, maxSize - (2 * textPadding))
        const textLine1 = new Jimp({ width: maxSize, height: maxSize, color: 0x0 });
        textLine1.print({ font: textLine1Font, x: 0, y: 0, text: { text: firstLine, alignmentX: HorizontalAlign.CENTER, alignmentY: (secondLine === undefined) ? VerticalAlign.MIDDLE : VerticalAlign.BOTTOM }, maxHeight: (secondLine === undefined) ? maxSize : dualtextLineHeight - (textPadding / 2), maxWidth: maxSize });
        image.blit(textLine1);

        if (secondLine !== undefined) {
            // text textLine 2
            const textLine2Font = await TextToImage.getFont(secondLine, maxSize - (2 * textPadding))
            const textLine2 = new Jimp({ width: maxSize, height: maxSize, color: 0x0 });
            textLine2.print({ font: textLine2Font, x: 0, y: dualtextLineHeight + (textPadding / 2), text: { text: secondLine, alignmentX: HorizontalAlign.CENTER, alignmentY: VerticalAlign.TOP }, maxHeight: dualtextLineHeight - (textPadding / 2), maxWidth: maxSize });
            image.blit(textLine2);
        }

        return image;
    }

    private static async getFont(text: string, maxWidth: number) {
        const font128 = await loadFont(Font.SANS_128_WHITE);
        if (measureText(font128, text) < maxWidth) {
            return font128
        }

        const font64 = await loadFont(Font.SANS_64_WHITE);
        if (measureText(font64, text) < maxWidth) {
            return font64
        }

        const font32 = await loadFont(Font.SANS_32_WHITE);
        if (measureText(font32, text) < maxWidth) {
            return font32
        }

        const font16 = await loadFont(Font.SANS_16_WHITE);
        if (measureText(font16, text) < maxWidth) {
            return font16
        }

        return await loadFont(Font.SANS_8_WHITE);
    }
}