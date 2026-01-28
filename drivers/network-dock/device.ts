import Homey, { FlowCardTrigger, FlowCardTriggerDevice } from 'homey';
import type { StreamDeckButtonControlDefinitionLcdFeedback } from '@elgato-stream-deck/core'
import { StreamDeckTcpConnectionManager, StreamDeckTcp } from '@elgato-stream-deck/tcp'
import { Button, Dashboard, DashboardButton, Store } from '../../lib/storage';
import { Jimp } from 'jimp';

module.exports = class NetworkDock extends Homey.Device {

  private store = new Store(this.homey);
  private connectionManager = new StreamDeckTcpConnectionManager();
  private streamDeck: StreamDeckTcp | undefined;
  private dashboard: Dashboard | undefined;

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
    await this.updateDashboardOptions();

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

        const dashboard: Dashboard | undefined = this.map(await this.getCapabilityValue('dashboard'), id => this.store.getDashboard(id));
        this.streamDeckLoadDashboard(streamDeck, dashboard);
      } else if (this.streamDeck == undefined) {
        await this.setUnavailable("No Stream Deck connected to Network Dock");
      }
    });

    this.homey.settings.on('set', async (key: string) => {
      if (key === "dashboards") {
        await this.updateDashboardOptions();
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

    this.registerCapabilityListener('dashboard', async (value: string) => {
      const dashboard: Dashboard | undefined = this.store.getDashboard(value);
      this.streamDeckLoadDashboard(this.streamDeck, dashboard);
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

      streamDeck.on('down', async (control) => {
        if (control.type === 'button') {
          const button = this.dashboard?.items.find((item) => item.item === control.index+1);
          const tokens = { dashboard: this.dashboard?.name ?? "", button: button?.name ?? "", column: control.column + 1, row: control.row + 1 };
          this.onNetworkDockAnyButtonPressed.trigger(this, tokens);
          if (button !== undefined && this.dashboard?.name !== undefined) {
            await this.triggerAll([this.onGenericButtonPressed, this.onNetworkDockButtonPressed], tokens, button.id);
            this.log("press button " + button.name);
          } else {
            this.log("press button -no button set-");
          }
        }
      });

      streamDeck.on('up', async (control) => {
        if (control.type === 'button') {
          const button = this.dashboard?.items.find((item) => item.item === control.index+1);
          const tokens = { dashboard: this.dashboard?.name ?? "", button: button?.name ?? "", column: control.column + 1, row: control.row + 1 };
          this.onNetworkDockAnyButtonReleased.trigger(this, tokens);
          if (button !== undefined && this.dashboard?.name !== undefined) {
            await this.triggerAll([this.onGenericButtonReleased, this.onNetworkDockButtonReleased], tokens, button.id);
            this.log("release button " + button.name);
          } else {
            this.log("release button -no button set-");
          }
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

  async streamDeckLoadDashboard(streamDeck: StreamDeckTcp | undefined, dashboard: Dashboard | undefined) {
    if (streamDeck === undefined || dashboard === undefined) {
      await streamDeck?.clearPanel();
      this.dashboard = undefined;
      return
    }

    this.dashboard = dashboard;
    const controls = streamDeck.CONTROLS.map((control) => control as StreamDeckButtonControlDefinitionLcdFeedback)
    for (const [i, control] of controls.entries()) {
      const item = dashboard.items.find((item) => item.item === i+1);
      if (item !== undefined) {
        await this.streamDeckSetImage(streamDeck, control, item.imageBuffer);
      } else {
        await streamDeck.clearKey(control.index);
      }
    }
  }

  async streamDeckSetImage(streamDeck: StreamDeckTcp, control: StreamDeckButtonControlDefinitionLcdFeedback, imageBuffer: Buffer) {
    const jimp = await Jimp.fromBuffer(imageBuffer);
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

  async triggerAll(cards: (Homey.FlowCardTrigger | Homey.FlowCardTriggerDevice)[], tokens: object, buttonId: string) {
    for (const card of cards) {
      const argument = (card instanceof Homey.FlowCardTrigger) ? await card.getArgumentValues() : await card.getArgumentValues(this);
      const uniqueNames = new Set<string>(argument.filter((value) => value.button.id === buttonId).map((value) => value.button.name))
      const states = Array.from(uniqueNames).map(name => this.autocompleteForButton(buttonId, name));
      states.forEach((state) => {
        if (card instanceof Homey.FlowCardTrigger) {
          card.trigger(tokens, { button: state });
        } else {
          card.trigger(this, tokens, { button: state });
        }
      });
    };
  }

  async updateDashboardOptions() {
    const allDashboards = this.store.getDashboards();
    const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
    await this.setCapabilityOptions('dashboard', {values: allDashboards.map((dashboard) => ({"id": dashboard.id, "title": { "en": dashboard.name}}))});
    
    // dashboard has not been set or doesn't exist anymore
    if (selectedDashboardId === undefined || !allDashboards.map((dashboard) => dashboard.id).includes(selectedDashboardId)) {
      const dashboard = this.map(allDashboards.shift()?.id, id => this.store.getDashboard(id));

      // set the first dashboard as new dashboard
      this.setCapabilityValue('dashboard', dashboard?.id);

      // load the new dashboard
      await this.streamDeckLoadDashboard(this.streamDeck, dashboard);
    }
  }

  autocompleteForButton(id: string, name: string) {
    return {
      id: id,
      name: name,
      description: ''
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
        return this.autocompleteForButton(button.id, button.name)
      });
    });
  }

  map<A, B>(value: A | undefined, f: (value: A) => B): B | undefined {
    if (value === undefined) return undefined;
    return f(value);
  }
};
