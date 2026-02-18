'use strict';

import { TextToImage } from './lib/textToImage';
import { Jimp } from 'jimp';

module.exports = {
  async textToImage({ homey, body }) {
    const firstLine = body.firstLine;
    const secondLine = body.secondLine !== undefined && body.secondLine !== "" ? body.secondLine : undefined;
    const jimp = await TextToImage.create(300, firstLine, secondLine);
    return jimp.getBase64("image/jpeg", { quality: 0.8, });
  },
};
