import Homey, { FlowCardTrigger, FlowCardTriggerDevice } from 'homey';
import type { StreamDeckButtonControlDefinitionLcdFeedback } from '@elgato-stream-deck/core'
import { StreamDeckTcpConnectionManager, StreamDeckTcp } from '@elgato-stream-deck/tcp'
import { Button, Store } from '../../lib/storage';
import { Jimp } from 'jimp';

module.exports = class NetworkDock extends Homey.Device {

  private store = new Store(this.homey);
  private connectionManager = new StreamDeckTcpConnectionManager();
  private streamDeck: StreamDeckTcp | undefined;

  private onGenericButtonPressed: FlowCardTrigger = this.homey.flow.getTriggerCard('generic_button_pressed');
  private onNetworkDockButtonPressed: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('network_dock_button_pressed');
  private onNetworkDockAnyButtonPressed: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('network_dock_any_button_pressed');
  private onGenericButtonReleased: FlowCardTrigger = this.homey.flow.getTriggerCard('generic_button_released');
  private onNetworkDockButtonReleased: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('network_dock_button_released');
  private onNetworkDockAnyButtonReleased: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('network_dock_any_button_released');

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.registerButtonAutocompleteListenerForCard(this.onGenericButtonPressed);
    this.registerButtonAutocompleteListenerForCard(this.onNetworkDockButtonPressed);
    this.registerButtonAutocompleteListenerForCard(this.onGenericButtonReleased);
    this.registerButtonAutocompleteListenerForCard(this.onNetworkDockButtonReleased);

    const ipAddress = this.getSetting("ipAddress");
    this.log("NetworkDock has been initialized");

    this.connectionManager.connectTo(ipAddress)

    this.connectionManager.on('error', async (message) => {
        await this.setUnavailable(message);
    });

    this.connectionManager.on('connected', async (streamDeck) => {
      this.log("connectionManager - connected");

      if (streamDeck.CONTROLS.length > 0) {
        this.streamDeck = streamDeck
        await this.setAvailable();
        this.streamDeckDidConnect(streamDeck);
        this.streamDeckLoadDashboard(streamDeck);
      } else if (this.streamDeck == undefined) {
        await this.setUnavailable("No Stream Deck connected to Network Dock");
      }
    });

    this.registerCapabilityListener('onoff', async (value: boolean) => {
      const number: number = value ? 100 : 0;
      await this.streamDeck?.setBrightness(number);
      this.setCapabilityValue('dim', number);
    });

    this.registerCapabilityListener('dim', async (value: number) => {
      await this.streamDeck?.setBrightness(value * 100);
      this.setCapabilityValue('onoff', value > 0);
    });
  }

  async streamDeckDidConnect(streamDeck: StreamDeckTcp) {
      this.log("device - connected");

      streamDeck.tcpEvents.on('disconnected', async () => {
        this.log("device - disconnected");
        await this.setUnavailable("Stream Deck Disconnected");
        this.streamDeck = undefined;
      });
      streamDeck.on('error', async (error) => {
        this.log("device - error " + error);
        const message = typeof error === 'string' ? error : undefined;
        await this.setUnavailable(message);
      });
      streamDeck.on('down', (control) => {
        if (control.type === 'button') {
          const column = control.column + 1;
          const row = control.row + 1;
          const button = this.store.getButtons()[control.index]; // todo update when dashboards can be configured
          this.onGenericButtonPressed.trigger({ column: column, row: row }, { button: button.name });
          this.onNetworkDockButtonPressed.trigger(this, { column: column, row: row }, { button: button.name });
          this.onNetworkDockAnyButtonPressed.trigger(this, { button: { id: button.name }, column: column, row: row });
          this.log("press button " + button.name + " on " + column + "x" + row);
        }
      });
      streamDeck.on('up', (control) => {
        if (control.type === 'button') {
          const column = control.column + 1;
          const row = control.row + 1;
          const button = this.store.getButtons()[control.index]; // todo update when dashboards can be configured
          this.onGenericButtonReleased.trigger({ column: column, row: row }, { button: button.name });
          this.onNetworkDockButtonReleased.trigger(this, { column: column, row: row }, { button: button.name });
          this.onNetworkDockAnyButtonReleased.trigger(this, { button: button.name, column: column, row: row });
          this.log("release button " + button.name + " on " + column + "x" + row);
        }
      });

      const size = streamDeck.CONTROLS.reduce((result, control) => {
        if (control as StreamDeckButtonControlDefinitionLcdFeedback) {
          if (result.columns < (control.column + 1)) {
            result.columns = control.column + 1
          }
          if (result.rows < (control.row + 1)) {
            result.rows = control.row + 1
          }
        }
        return result
      }, {columns: 0, rows: 0});

      await this.setSettings({
        name: streamDeck.PRODUCT_NAME,
        serial: await streamDeck.getSerialNumber(),
        firmware: await streamDeck.getFirmwareVersion(),
        columns: size.columns,
        rows: size.rows
      });
  }

  async streamDeckLoadDashboard(streamDeck: StreamDeckTcp) {
    await streamDeck.clearPanel();
 // todo update when dashboards can be configured
    const images = this.store.getButtons();
    const buttons = streamDeck.CONTROLS.map((control) => control as StreamDeckButtonControlDefinitionLcdFeedback)
    
    for (const [i, button] of buttons.entries()) {
      if (typeof images[i] !== "undefined") {
        await this.streamDeckSetImage(streamDeck, button, images[i].id);
      }
    }
  }

  async streamDeckSetImage(streamDeck: StreamDeckTcp, control: StreamDeckButtonControlDefinitionLcdFeedback, imageId: string) {
    const base64ImageString = this.homey.settings.get(imageId).slice("data:image/png;base64,".length).toString();
    const jimp = await Jimp.fromBuffer(Buffer.from(base64ImageString, 'base64'));
    const img = await jimp
      .normalize()
      .scaleToFit({w: control.pixelSize.width, h: control.pixelSize.height});
    await streamDeck.fillKeyBuffer(control.index, img.bitmap.data, { format: 'rgba' });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('NetworkDock has been added');
      await this.setCapabilityValue('dim', 1.0);
      await this.setCapabilityValue('onoff', true);
  } 

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }: {
    oldSettings: { [key: string]: boolean | string | number | undefined | null };
    newSettings: { [key: string]: boolean | string | number | undefined | null };
    changedKeys: string[];
  }): Promise<string | void> {
    const oldIp = oldSettings["ipAddress"] as string;
    const newIp = newSettings["ipAddress"] as string;
    if (oldIp !== newIp) {
      await this.streamDeck?.clearPanel();
      this.connectionManager.disconnectFrom(oldIp);
      this.connectionManager.connectTo(newIp);
    }
  }  
  
  async onDeleted() {
    this.log('NetworkDock has been deleted');
    await this.streamDeck?.clearPanel();
    this.streamDeck?.tcpEvents.removeAllListeners()
    const ipAddress = this.streamDeck?.remoteAddress
    if (ipAddress !== undefined) {
      this.log("disconnect from " + ipAddress);
      this.connectionManager.disconnectFrom(ipAddress);
    }
  }
  
  registerButtonAutocompleteListenerForCard(card: Homey.FlowCardTriggerDevice) {
    card.registerArgumentAutocompleteListener('button', (query: string, args: any) => {
      return this.store
      .getButtons()
      .filter((button) => {
        return query.length == 0 || button.name.toLowerCase().includes(query.toLowerCase());
      })
      .sort()
      .map(button => {
        return {
          id: button.id,
          name: button.name,
          description: ''
        }
      });
    });
  }
};
