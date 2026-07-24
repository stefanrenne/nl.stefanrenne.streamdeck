import { TextToImage } from './lib/textToImage.mjs';

export default {
  async textToImage({ body }: { body: { firstLine: string; secondLine?: string; textColor?: string; backgroundColor?: string } }) {
    const firstLine = body.firstLine;
    const secondLine = (body.secondLine !== undefined && body.secondLine !== "") ? body.secondLine : undefined;
    const textColor = (body.textColor !== undefined) ? body.textColor : "#ffffff";
    const backgroundColor = (body.backgroundColor !== undefined) ? body.backgroundColor : "#000000";
    const jimp = await TextToImage.create(TextToImage.sampleSize, firstLine, secondLine, textColor, backgroundColor);
    return await jimp.getBase64("image/jpeg", { quality: 0.8, });
  },
};
