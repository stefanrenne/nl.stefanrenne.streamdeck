import StreamDeckDevice from '../../lib/streamDeckDevice.mjs';
import { isVirtualDeckModelId, VirtualDeckModelId, VirtualDeckState, VirtualStreamDeck } from '../../lib/virtualStreamDeck.mjs';

/** The realtime event every virtual deck sends its changes on. The widget filters on `deviceId`. */
export const VIRTUAL_DECK_EVENT = 'virtual-deck';

export type VirtualDeckChange =
  | { type: 'state', state: VirtualDeckState }
  | { type: 'key', index: number, image: string | null }
  | { type: 'brightness', brightness: number }
  | { type: 'deleted' };

export type VirtualDeckEvent = { deviceId: string } & VirtualDeckChange;

/**
 * A Stream Deck that only exists in Homey and is shown and pressed in the "Virtual Stream Deck"
 * widget. It behaves like a Network Dock (see `StreamDeckDevice`), but the deck is a
 * `VirtualStreamDeck` that is always connected.
 */
export default class VirtualDeck extends StreamDeckDevice<VirtualStreamDeck> {

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(`VirtualDeck ${this.getData().id} has been initialized, model ${this.getSetting('model')}`);
    await super.onInit();
    await this.attach(this.modelFrom(this.getSetting('model')));
  }

  /** A model that isn't known (yet) falls back to the MK.2, the most common deck. */
  modelFrom(value: unknown): VirtualDeckModelId {
    return isVirtualDeckModelId(value) ? value : 'mk2';
  }

  /** Replaces the deck with a new one of `model`, tells the widgets, and draws the dashboard on it. */
  async attach(model: VirtualDeckModelId) {
    this.streamDeck?.removeAllListeners();

    const deck = new VirtualStreamDeck(model);
    deck.on('key', (index, image) => this.publish({ type: 'key', index, image }));
    deck.on('brightness', (brightness) => this.publish({ type: 'brightness', brightness }));
    deck.on('down', this.guard('down', async (control) => {
      await this.streamDeckEvent('down', this.getCapabilityValue('onoff'), control);
    }));
    deck.on('up', this.guard('up', async (control) => {
      await this.streamDeckEvent('up', this.getCapabilityValue('onoff'), control);
    }));

    this.publish({ type: 'state', state: deck.getState() });
    await this.deckDidConnect(deck);
  }

  getVirtualState(): VirtualDeckState {
    if (this.streamDeck === undefined) {
      throw new Error('Virtual Stream Deck is not ready');
    }
    return this.streamDeck.getState();
  }

  /** A key press from the widget. */
  press(index: number, action: string) {
    if (this.streamDeck === undefined) {
      throw new Error('Virtual Stream Deck is not ready');
    }
    if (action !== 'down' && action !== 'up') {
      throw new TypeError(`Expected action down or up, got ${action}`);
    }
    this.streamDeck.press(index, action);
  }

  private publish(event: VirtualDeckChange) {
    const payload: VirtualDeckEvent = { deviceId: this.getData().id, ...event };
    Promise.resolve(this.homey.api.realtime(VIRTUAL_DECK_EVENT, payload))
      .catch((e) => this.log(`realtime ${event.type} failed: ${e}`));
  }

  /**
   * onSettings is called when the user updates the device's settings.
   */
  async onSettings({
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    if (changedKeys.includes('model')) {
      await this.attach(this.modelFrom(newSettings['model']));
    }
  }

  async onDeleted() {
    this.log('VirtualDeck has been deleted');
    this.streamDeck?.removeAllListeners();
    this.streamDeck = undefined;
    this.publish({ type: 'deleted' });
  }
};
