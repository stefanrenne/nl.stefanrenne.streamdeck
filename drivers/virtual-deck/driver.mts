import Homey from 'homey';
import { randomUUID } from 'node:crypto';
import { VIRTUAL_DECK_MODELS } from '../../lib/virtualStreamDeck.mjs';

export default class VirtualDeckDriver extends Homey.Driver {

  async onInit() {
    this.log('VirtualDeckDriver has been initialized');
  }

  /**
   * One entry per model, named after the model so the pairing tile shows what tells them apart,
   * with an icon of its key grid. A virtual deck has no hardware to find, so every pairing adds a new one.
   */
  async onPairListDevices() {
    return Object.entries(VIRTUAL_DECK_MODELS).map(([model, { name }]) => ({
      name,
      icon: `/icons/${model}.svg`,
      data: {
        id: randomUUID(),
      },
      settings: {
        model,
      },
    }));
  }

};
