import Homey from 'homey';
import { StreamDeckTcpConnectionManager, StreamDeckTcp } from '@elgato-stream-deck/tcp'

module.exports = class NetworkDock extends Homey.Device {

  connectionManager = new StreamDeckTcpConnectionManager()

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    const ipAddress = this.getSetting("ipAddress");
    this.log("NetworkDock has been initialized for ip: " + ipAddress);

    this.connectionManager.connectTo(ipAddress)

    this.connectionManager.on('error', this.connectionError)

    this.connectionManager.on('connected', async (streamDeck) => {
      streamDeck.tcpEvents.on('disconnected', () => {
        this.streamDeckDidDisconnect(streamDeck);
      });
      streamDeck.on('error', (error) => {
        this.streamDeckDidError(streamDeck, error);
      });
      streamDeck.on('down', (control) => {
        if (control.type === 'button') {
          this.log("down " + control.column + "x" + control.row);
        }
      });
      streamDeck.on('up', (control) => {
        if (control.type === 'button') {
          this.log("up " + control.column + "x" + control.row);
        }
      });
      this.streamDeckDidConnect(streamDeck);

        // streamDeck
        //   .setBrightness(100)

      // streamDeck.clearPanel().catch((e) => this.error('clear panel failed:', e))
    });

  }

  async connectionError(error: String) {

  }

  async streamDeckDidConnect(streamDeck: StreamDeckTcp) {

      if (streamDeck.CONTROLS.length === 0) {
        // Empty Network dock, skip the rest.
        return
      }

      const size = streamDeck.CONTROLS.reduce((result, control) => {
        if (result.colomns < (control.column + 1)) {
          result.colomns = control.column + 1
        }
        if (result.rows < (control.row + 1)) {
          result.rows = control.row + 1
        }
        return result
      }, {colomns: 0, rows: 0});

      await this.setSettings({
        name: streamDeck.PRODUCT_NAME,
        serial: await streamDeck.getSerialNumber(),
        firmware: await streamDeck.getFirmwareVersion(),
        colomns: size.colomns,
        rows: size.rows
      });

  }

  async streamDeckDidDisconnect(streamDeck: StreamDeckTcp) {
    
  }

  async streamDeckDidError(streamDeck: StreamDeckTcp, error: unknown) {
    
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
