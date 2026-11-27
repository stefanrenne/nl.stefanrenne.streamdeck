import type Homey from 'homey/lib/Homey.js';
import type VirtualDeck from '../../drivers/virtual-deck/device.mjs';

/** The virtual deck whose `data.id` the widget's `device` setting holds. */
function findDevice(homey: Homey, deviceId: unknown): VirtualDeck {
  const device = homey.drivers.getDriver('virtual-deck').getDevices()
    .find((candidate) => candidate.getData().id === deviceId);
  if (device === undefined) {
    throw new Error('Virtual Stream Deck not found');
  }
  return device as VirtualDeck;
}

export default {
  async getState({ homey, query }: { homey: Homey, query: { deviceId?: string } }) {
    return findDevice(homey, query.deviceId).getVirtualState();
  },

  async press({ homey, body }: { homey: Homey, body: { deviceId?: string, index?: number, action?: string } }) {
    findDevice(homey, body.deviceId).press(Number(body.index), String(body.action));
    return {};
  },
};
