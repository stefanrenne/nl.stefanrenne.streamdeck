import Homey, { FlowCardTriggerDevice } from 'homey';
import { StreamDeckTcpConnectionManager, StreamDeckTcp } from '@elgato-stream-deck/tcp'

module.exports = class NetworkDock extends Homey.Device {

  private connectionManager = new StreamDeckTcpConnectionManager()
  private streamDeck: StreamDeckTcp | undefined
  private onButtonPress: FlowCardTriggerDevice | undefined;
  private onButtonRelease: FlowCardTriggerDevice | undefined;

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    const ipAddress = this.getSetting("ipAddress");
    this.log("NetworkDock has been initialized for ip: " + ipAddress);

    this.onButtonPress = this.homey.flow.getDeviceTriggerCard('on_button_press');
    this.onButtonRelease = this.homey.flow.getDeviceTriggerCard('on_button_release');

    this.connectionManager.connectTo(ipAddress)

    this.connectionManager.on('error', async (message) => {
        await this.setUnavailable(message);
    });

    this.connectionManager.on('connected', async (streamDeck) => {
      this.streamDeck = streamDeck
      streamDeck.tcpEvents.on('disconnected', async () => {
        await this.setUnavailable("Stream Deck Disconnected");
        this.streamDeck = undefined;
      });
      streamDeck.on('error', async (error) => {
        const message = typeof error === 'string' ? error : undefined;
        await this.setUnavailable(message);
      });
      streamDeck.on('down', (control) => {
        if (control.type === 'button') {
          this.onButtonPress?.trigger(this, { column: control.column, row: control.row, item: control.index + 1 });
          this.log("press " + control.column + "x" + control.row);
        }
      });
      streamDeck.on('up', (control) => {
        if (control.type === 'button') {
          this.onButtonRelease?.trigger(this, { column: control.column, row: control.row, item: control.index + 1 });
          this.log("release " + control.column + "x" + control.row);
        }
      });

      if (streamDeck.CONTROLS.length > 0) {
        await this.setAvailable();
        this.streamDeckDidConnect(streamDeck);
      } else {
        await this.setUnavailable("No Stream Deck connected to Network Dock");
      }
    });

    this.registerCapabilityListener('onoff', async (value) => {
      this.log("onoff: " + value)
    });

    this.registerCapabilityListener('dim', async (value) => {
      await this.streamDeck?.setBrightness(value * 100)
    });
  }

  async streamDeckDidConnect(streamDeck: StreamDeckTcp) {

      const size = streamDeck.CONTROLS.reduce((result, control) => {
        if (result.columns < (control.column + 1)) {
          result.columns = control.column + 1
        }
        if (result.rows < (control.row + 1)) {
          result.rows = control.row + 1
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

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('NetworkDock has been added');
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
    this.log("NetworkDock settings where changed");
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name: string) {
    this.log('NetworkDock was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('NetworkDock has been deleted');
  }

};
