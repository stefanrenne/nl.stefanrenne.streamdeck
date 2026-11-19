import Homey from 'homey';
import { randomUUID } from 'node:crypto';
import { VIRTUAL_DECK_MODELS } from '../../lib/virtualStreamDeck.mjs';

export default class VirtualDeckDriver extends Homey.Driver {

  async onInit() {
    this.log('VirtualDeckDriver has been initialized');
  }

  /** One entry per model. A virtual deck has no hardware to find, so every pairing adds a new one. */
  async onPairListDevices() {
    return Object.entries(VIRTUAL_DECK_MODELS).map(([model, { name, columns, rows }]) => ({
      name: this.homey.__('virtualDeck.deviceName', { model: name, size: `${columns}×${rows}` }),
      data: {
        id: randomUUID(),
      },
      settings: {
        model,
      },
    }));
  }

};
