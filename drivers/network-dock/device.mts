import { DiscoveryResultMDNSSD } from 'homey';
import { StreamDeckTcpConnectionManager, StreamDeckTcp } from '@elgato-stream-deck/tcp'
import StreamDeckDevice from '../../lib/streamDeckDevice.mjs';
import { getButtonControlSize } from '../../lib/streamDeckAdapter.mjs';

/**
 * A Stream Deck behind a Network Dock. This class only owns the TCP connection and discovery;
 * dashboards, capabilities and Flow triggers are in `StreamDeckDevice`.
 */
export default class NetworkDock extends StreamDeckDevice<StreamDeckTcp> {

  private connectionManager = new StreamDeckTcpConnectionManager();

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log(`NetworkDock ${this.getData().id} has been initialized, ipAddress ${this.getSetting('ipAddress')}`);
    await super.onInit();

    this.connectionManager.on('error', this.guard('error', async (message) => {
        this.log('connectionManager - error ' + message);
        await this.setUnavailable(message);
    }));

    this.connectionManager.on('connected', this.guard('connected', async (streamDeck) => {
      this.log('connectionManager - connected');

      if (streamDeck.CONTROLS.length > 0) {
        this.streamDeck = streamDeck
        await this.setAvailable();
        await this.streamDeckDidConnect(streamDeck);
        await this.deckDidConnect(streamDeck);
      } else if (this.streamDeck == undefined) {
        await this.setUnavailable('No Stream Deck connected to Network Dock');
      }
    }));
  }

  async streamDeckDidConnect(streamDeck: StreamDeckTcp) {
      this.log('device - connected');

      streamDeck.tcpEvents.on('disconnected', this.guard('disconnected', async () => {
        this.log('device - disconnected');
        await this.setUnavailable('Stream Deck Disconnected');
        this.streamDeck = undefined;
      }));

      streamDeck.on('error', this.guard('error', async (error) => {
        this.log('device - error ' + error);
        const message = typeof error === 'string' ? error : undefined;
        await this.setUnavailable(message);
      }));

      streamDeck.on('down', this.guard('down', async (control) => {
        if (control.type === 'button') {
          await this.streamDeckEvent('down', this.getCapabilityValue('onoff'), control);
        }
      }));

      streamDeck.on('up', this.guard('up', async (control) => {
        if (control.type === 'button') {
          await this.streamDeckEvent('up', this.getCapabilityValue('onoff'), control);
        }
      }));

      const size = getButtonControlSize(streamDeck);
      // Serial and firmware are informational only, and are fetched over TCP
      // feature reports that can time out even when the dock is otherwise
      // connected. Never let that failure bubble up and crash the app.
      const [serial, firmware] = await Promise.all([
        streamDeck.getSerialNumber().catch((e) => {
          this.log('device - failed to read serial number: ' + e);
          return undefined;
        }),
        streamDeck.getFirmwareVersion().catch((e) => {
          this.log('device - failed to read firmware version: ' + e);
          return undefined;
        }),
      ]);

      const settings: { [key: string]: string | number } = {
        name: streamDeck.PRODUCT_NAME,
        columns: size.columns,
        rows: size.rows,
      };
      if (serial !== undefined) {
        settings.serial = serial;
      }
      if (firmware !== undefined) {
        settings.firmware = firmware;
      }
      await this.setSettings(settings);
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
    if (changedKeys.includes('ipAddress')) {
      const oldIp = oldSettings['ipAddress'] as string;
      const newIp = newSettings['ipAddress'] as string;
      if (oldIp !== newIp) {
        await this.streamDeck?.clearPanel();
        this.connectToAddress(newIp);
      }
    }
  }

  async onDeleted() {
    this.log('NetworkDock has been deleted');
    await this.streamDeck?.clearPanel();
    this.streamDeck?.tcpEvents.removeAllListeners()
    // The connected address, not the deck's: a dock that isn't reachable is still being retried.
    const ipAddress = this.connectedAddress;
    if (ipAddress !== undefined) {
      this.log('disconnect from ' + ipAddress);
      this.connectionManager.disconnectFrom(ipAddress);
      this.connectedAddress = undefined;
    }
  }

  /**
   * Discovery result update
   */
  onDiscoveryResult(discoveryResult: DiscoveryResultMDNSSD) {
    const matches = discoveryResult.id === this.getData().id;
    this.log(`onDiscoveryResult ${discoveryResult.id} at ${discoveryResult.address}, matches: ${matches}`);
    return matches;
  }

  async onDiscoveryAvailable(discoveryResult: DiscoveryResultMDNSSD) {
    const ipAddress = this.getSetting('ipAddress');
    this.log(`onDiscoveryAvailable at ${discoveryResult.address}, connecting to ${ipAddress}`);
    this.connectToAddress(ipAddress);
  }

  onDiscoveryAddressChanged(discoveryResult: DiscoveryResultMDNSSD) {
    this.log('onDiscoveryAddressChanged to ' + discoveryResult.address);
    // setSettings doesn't call onSettings, so reconnect here.
    this.connectToAddress(discoveryResult.address);
    this.setSettings({'ipAddress': discoveryResult.address}).catch((e) => console.error('update ipAddress failed:', e));
  }

  /**
   * Connects to `address`, dropping the connection to a previous address. The connection manager
   * keeps retrying a connection by itself and throws for an address it already has, so calling
   * this again for the same address does nothing.
   */
  private connectedAddress: string | undefined;
  connectToAddress(address: string) {
    if (address === this.connectedAddress) {
      return;
    }
    if (this.connectedAddress !== undefined) {
      this.connectionManager.disconnectFrom(this.connectedAddress);
    }
    this.connectedAddress = address;
    this.connectionManager.connectTo(address);
  }
};
