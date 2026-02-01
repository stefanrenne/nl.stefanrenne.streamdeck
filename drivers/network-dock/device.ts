import Homey, { FlowCardAction, FlowCardCondition, FlowCardTrigger, FlowCardTriggerDevice } from 'homey';
import type { StreamDeckButtonControlDefinitionLcdFeedback } from '@elgato-stream-deck/core'
import { StreamDeckTcpConnectionManager, StreamDeckTcp } from '@elgato-stream-deck/tcp'
import { Button, Dashboard, DashboardButton, Store } from '../../lib/storage';
import { Jimp } from 'jimp';
import path from 'path';

module.exports = class NetworkDock extends Homey.Device {

  private store = new Store(this.homey);
  private connectionManager = new StreamDeckTcpConnectionManager();
  private streamDeck: StreamDeckTcp | undefined;
  private dashboard: Dashboard | undefined;

  private onGenericButtonPressed: FlowCardTrigger = this.homey.flow.getTriggerCard('generic_button_pressed');
  private onNetworkDockButtonPressed: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('network_dock_button_pressed');
  private onGenericButtonReleased: FlowCardTrigger = this.homey.flow.getTriggerCard('generic_button_released');
  private onNetworkDockButtonReleased: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('network_dock_button_released');
  private onDashboardChanged: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('changed_dashboard');

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.registerButtonAutocompleteListenerForCard(this.onGenericButtonPressed);
    this.registerButtonAutocompleteListenerForCard(this.onNetworkDockButtonPressed);
    this.registerButtonAutocompleteListenerForCard(this.onGenericButtonReleased);
    this.registerButtonAutocompleteListenerForCard(this.onNetworkDockButtonReleased);
    this.registerIsDashboardListener();
    this.registerChangeDashboardListener();
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
      if (dashboard !== undefined) {
        await this.onDashboardChanged.trigger(this, { 'dashboard': dashboard.name });
      }
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
        if (!this.getCapabilityValue('onoff')) {
          return
        }
        var actions: Promise<void>[] = []
        if (control.type === 'button') {
          const button = this.dashboard?.items.find((item) => item.item === control.index+1);
          if (button !== undefined && this.dashboard?.name !== undefined) {
            const tokens = { dashboard: this.dashboard?.name, column: control.column + 1, row: control.row + 1 };
            actions.push(this.onGenericButtonPressed.trigger(tokens, { buttonId: button.id }));
            actions.push(this.onNetworkDockButtonPressed.trigger(this, tokens, { buttonId: button.id }));
            this.log("press button " + button.name);
          } else {
            this.log("press button -no button set-");
          }
        }
        if (actions.length > 0) {
          await Promise.all(actions);
        }
      });

      streamDeck.on('up', async (control) => {
        if (!this.getCapabilityValue('onoff')) {
          return
        }

        var actions: Promise<void>[] = []
        if (control.type === 'button') {
          const button = this.dashboard?.items.find((item) => item.item === control.index+1);
          if (button !== undefined && this.dashboard?.name !== undefined) {
            const tokens = { dashboard: this.dashboard?.name, column: control.column + 1, row: control.row + 1 };
            actions.push(this.onGenericButtonReleased.trigger(tokens, { buttonId: button.id }));
            actions.push(this.onNetworkDockButtonReleased.trigger(this, tokens, { buttonId: button.id }));
            this.log("release button " + button.name);
          } else {
            this.log("release button -no button set-");
          }
        }
        if (actions.length > 0) {
          await Promise.all(actions);
        }
      });

      const size = this.getButtonControlSize(streamDeck);
      await this.setSettings({
        name: streamDeck.PRODUCT_NAME,
        serial: await streamDeck.getSerialNumber(),
        firmware: await streamDeck.getFirmwareVersion(),
        columns: size.columns,
        rows: size.rows
      });
  }

  async streamDeckLoadDefaultDashboard(streamDeck: StreamDeckTcp) {
    	const panelDimensions = streamDeck.calculateFillPanelDimensions();
      if (panelDimensions === null) {
        await streamDeck?.clearPanel();
        return
      }
      
      const padding: number = 50
    	const image = await Jimp.read(path.resolve(__dirname, 'assets/homey-logo.png')).then((jimp) => {
        return jimp.scaleToFit({ w: panelDimensions.width - (padding * 2), h: panelDimensions.height - (padding * 2) })
      });
      
      const background = new Jimp({ width: panelDimensions.width, height: panelDimensions.height })
        .blit({ src: image, x: (panelDimensions.width - image.width) / 2, y: (panelDimensions.height - image.height) / 2 });

      await streamDeck.fillPanelBuffer(background.bitmap.data, { format: 'rgba' }).catch((e) => console.error('fillPanelBuffer failed:', e));
  }

  async streamDeckLoadDashboard(streamDeck: StreamDeckTcp | undefined, dashboard: Dashboard | undefined) {
    if (streamDeck === undefined) {
      this.dashboard = undefined;
      return
    }
    if (dashboard === undefined) {
      this.dashboard = undefined;
      this.streamDeckLoadDefaultDashboard(streamDeck);
      return
    }

    // Validate if the loaded dashboard has the correct number of buttons (6, 15 or 32)
    const size = this.getButtonControlSize(streamDeck);
    if (dashboard.displayMode < size.total) {
      this.store.updateDashboard(dashboard.id, size.total);
    }

    this.dashboard = dashboard;
    const controls = streamDeck.CONTROLS.map((control) => control as StreamDeckButtonControlDefinitionLcdFeedback)

    var actions: Promise<void>[] = []
    for (const [i, control] of controls.entries()) {
      const item = dashboard.items.find((item) => item.item === i+1);
      if (item === undefined) {
        actions.push(streamDeck.clearKey(control.index).catch((e) => console.error('clearKey failed:', e)));
      } else {
        actions.push(this.streamDeckSetImage(streamDeck, control, item.imageBuffer).catch((e) => console.error('streamDeckSetImage failed:', e)));
      }
    }
    await Promise.all(actions);
  }

  async streamDeckSetImage(streamDeck: StreamDeckTcp, control: StreamDeckButtonControlDefinitionLcdFeedback, imageBuffer: Buffer) {
    const image = await Jimp.fromBuffer(imageBuffer).then((jimp) => {
      return jimp.resize({ w: control.pixelSize.width, h: control.pixelSize.height });
    });
    await streamDeck.fillKeyBuffer(control.index, image.bitmap.data, { format: 'rgba' });
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

  getButtonControlSize(streamDeck: StreamDeckTcp) {
    return streamDeck.CONTROLS.reduce((result, control) => {
        if (control as StreamDeckButtonControlDefinitionLcdFeedback) {
          if (result.columns < (control.column + 1)) {
            result.columns = control.column + 1
            result.total = result.rows * result.columns;
          }
          if (result.rows < (control.row + 1)) {
            result.rows = control.row + 1
            result.total = result.rows * result.columns;
          }
        }
        return result
      }, {columns: 0, rows: 0, total: 0});
  }

  async updateDashboardOptions() {
    const allDashboards = this.store.getDashboards();
    const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
    await this.setCapabilityOptions('dashboard', {values: allDashboards.map((dashboard) => ({"id": dashboard.id, "title": { "en": dashboard.name}}))});
    
    // dashboard has not been set or doesn't exist anymore
    if (selectedDashboardId === undefined || !allDashboards.map((dashboard) => dashboard.id).includes(selectedDashboardId)) {
      const dashboard = this.map(allDashboards.shift()?.id, id => this.store.getDashboard(id));

      // set the first dashboard as new dashboard
      await this.setCapabilityValue('dashboard', dashboard?.id);

      // load the new dashboard
      await this.streamDeckLoadDashboard(this.streamDeck, dashboard);

      // notifiy about the dashboard change
      if (dashboard !== undefined) {
        await this.onDashboardChanged.trigger(this, { 'dashboard': dashboard.name })
      }
    }
  }

  createAutocompleteValue(id: string, name: string, image: string | undefined = undefined) {
    return {
      id: id,
      name: name,
      description: '',
      image: image ?? ''
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
        return this.createAutocompleteValue(button.id, button.name, button.base64Image);
      });
    });
    card.registerRunListener((args, state) => {
      return args.button.id === state.buttonId;
    });
  }
  
  registerDashboardAutocompleteListenerForCard(card: Homey.FlowCardCondition | Homey.FlowCardAction) {
    card.registerArgumentAutocompleteListener('dashboard', (query: string, args: any) => {
      return this.store
      .getDashboards()
      .filter((dashboard) => {
        return query.length == 0 || dashboard.name.toLowerCase().includes(query.toLowerCase());
      })
      .sort()
      .map(dashboard => {
        return this.createAutocompleteValue(dashboard.id, dashboard.name)
      });
    });
  }

  registerIsDashboardListener() {
    const card = this.homey.flow.getConditionCard('is_dashboard');
    this.registerDashboardAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
      const dashboardId: string = args.dashboard.id;
      return selectedDashboardId === dashboardId;
    });
  }

  registerChangeDashboardListener() {
    const card = this.homey.flow.getActionCard('set_dashboard');
    this.registerDashboardAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      if (!this.getAvailable()) {
        throw await "Stream Deck is unavailable";
      }
      
      const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
      const dashboardId: string = args.dashboard.id;
      if (selectedDashboardId === dashboardId) {
        // value not changed
        return {};
      }
      const newDashboard = this.store.getDashboard(dashboardId);
      if (newDashboard !== undefined) {
        await this.setCapabilityValue('dashboard', dashboardId);
        await this.onDashboardChanged.trigger(this, { 'dashboard': newDashboard.name });
        this.streamDeckLoadDashboard(this.streamDeck, newDashboard);
        return {};
      }
      throw "Unknown dashboard";
    });
  }

  map<A, B>(value: A | undefined, f: (value: A) => B): B | undefined {
    if (value === undefined) return undefined;
    return f(value);
  }
};
