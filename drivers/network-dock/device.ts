import Homey, { FlowCardAction, FlowCardCondition, FlowCardTrigger, FlowCardTriggerDevice } from 'homey';
import type { StreamDeckButtonControlDefinition, StreamDeckButtonControlDefinitionLcdFeedback } from '@elgato-stream-deck/core'
import { StreamDeckTcpConnectionManager, StreamDeckTcp } from '@elgato-stream-deck/tcp'
import { Dashboard, DashboardEmptyItem, DashboardImageItem, Store } from '../../lib/storage';
import { Jimp } from 'jimp';
import path from 'path';

module.exports = class NetworkDock extends Homey.Device {

  private store = new Store(this.homey);
  private connectionManager = new StreamDeckTcpConnectionManager();
  private streamDeck: StreamDeckTcp | undefined;
  private dashboard: Dashboard | undefined;
  private emptyDashboard = this.createAutocompleteValue('0', 'Homey')

  private onImageButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('image_button_action');
  private onAnyButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('any_button_action');
  private onDashboardChanged: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('changed_dashboard');

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.registerImageAutocompleteListenerForCard(this.onImageButtonAction);
    this.registerImageButtonRunListener(this.onImageButtonAction);
    this.registerAnyButtonRunListener(this.onAnyButtonAction);
    this.registerIsDashboardListener();
    this.registerChangeDashboardListener();

    await this.validateSelectedDashboardOption();
    await this.updateSelectableDashboardOptions();


    const ipAddress = this.getSetting('ipAddress');
    this.log('NetworkDock has been initialized');

    this.connectionManager.connectTo(ipAddress)

    this.connectionManager.on('error', async (message) => {
        await this.setUnavailable(message);
    });

    this.connectionManager.on('connected', async (streamDeck) => {
      this.log('connectionManager - connected');

      if (streamDeck.CONTROLS.length > 0) {
        this.streamDeck = streamDeck
        await this.setAvailable();
        this.streamDeckDidConnect(streamDeck);

        const dashboardId: string = await this.getCapabilityValue('dashboard') ?? this.emptyDashboard.id;
        await this.streamDeckLoadDashboard(streamDeck, dashboardId);
      } else if (this.streamDeck == undefined) {
        await this.setUnavailable('No Stream Deck connected to Network Dock');
      }
    });

    this.homey.settings.on('set-dashboard', async (id: string) => {
      this.store.invalidateDashboard(id);
      this.updateSelectableDashboardOptions();

      const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
      if (selectedDashboardId === id) {
        this.log('selected dashboard updated');
        await this.streamDeckLoadDashboard(this.streamDeck, id);
      }
    });

    this.homey.settings.on('unset-dashboard', async (id: string) => {
      const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
      if (selectedDashboardId === id) {
        this.log('selected dashboard removed');
        await this.loadEmptyDashboardOptions();
      }

      this.store.invalidateDashboard(id);
      this.updateSelectableDashboardOptions();
    });

    this.homey.settings.on('set-image', async (id: string) => {
      this.store.invalidateImage(id);
    });

    this.homey.settings.on('unset-image', async (id: string) => {
      this.store.invalidateImage(id);
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

    this.registerCapabilityListener('dashboard', async (id: string) => {
      await this.streamDeckLoadDashboard(this.streamDeck, id);
      const dashboardName = (id === this.emptyDashboard.id) ? this.emptyDashboard.name : this.store.getDashboard(id)?.name
      if (dashboardName) {
        await this.onDashboardChanged.trigger(this, { 'dashboard': dashboardName });
      }
    });
  }
  
  async streamDeckDidConnect(streamDeck: StreamDeckTcp) {
      this.log('device - connected');

      streamDeck.tcpEvents.on('disconnected', async () => {
        this.log('device - disconnected');
        await this.setUnavailable('Stream Deck Disconnected');
        this.streamDeck = undefined;
      });

      streamDeck.on('error', async (error) => {
        this.log('device - error ' + error);
        const message = typeof error === 'string' ? error : undefined;
        await this.setUnavailable(message);
      });

      streamDeck.on('down', async (control) => {
        if (this.getCapabilityValue('onoff') && control.type === 'button') {
          await this.streamDeckEvent('down', control);
        }
      });

      streamDeck.on('up', async (control) => {
        if (this.getCapabilityValue('onoff') && control.type === 'button') {
          await this.streamDeckEvent('up', control);
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

  async streamDeckLoadDashboard(streamDeck: StreamDeckTcp | undefined, id: string) {
    if (streamDeck === undefined) {
      this.dashboard = undefined;
      return
    }
    const dashboard: Dashboard | undefined = (id === this.emptyDashboard.id) ? undefined : this.store.getDashboard(id);
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
      const item = dashboard.items[i+1];
      switch (item?.kind) {
      case 'image':
        actions.push(this.streamDeckSetImage(streamDeck, control, item.imageBuffer).catch((e) => console.error('streamDeckSetImage failed:', e)));
      default:
        actions.push(streamDeck.clearKey(control.index).catch((e) => console.error('clearKey failed:', e)));
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

  // private lastKeypressTime: number = 0;
  // private singlePressEvent: Promise<void> | undefined;
  async streamDeckEvent(event: 'up' | 'down', control: StreamDeckButtonControlDefinition) {
    const button = this.dashboard?.items[control.index+1];
    if (button === undefined || this.dashboard?.name === undefined) {
      this.log(event + ' empty button');
      return
    }

    // if (event === 'released') {
    //   const thisKeypressTime = new Date().getTime();
    //   this.log(thisKeypressTime - this.lastKeypressTime)
    //   if (thisKeypressTime - this.lastKeypressTime <= 400) {
    //     this.singlePressEvent?.ca
    //     this.log('double press');
    //     this.lastKeypressTime = 0;
    //   } else {
    //     this.lastKeypressTime = thisKeypressTime;
    //     this.singlePressEvent = new Promise<void>((resolve) => {
    //       setTimeout(function() {
    //         console.log('single press');
    //         resolve()
    //       }, 400);
    //     });
    //   }
    // }

    var state: {}
    var tokens: { dashboard: string; imageName: string; payload: string; column: number; row: number; }
    var actions: Promise<void>[] = []

    switch (button.kind) {
    case 'image':
      state = { action: event, imageId: button.imageId }
      tokens = { dashboard: this.dashboard?.name ?? '', imageName: button.name, payload: button.payload, column: control.column + 1, row: control.row + 1 };
      actions.push(this.onImageButtonAction.trigger(this, tokens, state));
      this.log(event + ' image button ' + button.name);
      break; 
    default:
      state = { action: event }
      tokens = { dashboard: this.dashboard?.name ?? '', imageName: '', payload: button.payload, column: control.column + 1, row: control.row + 1 };
      this.log(event + ' empty button ');
      break;
    }
    actions.push(this.onAnyButtonAction.trigger(this, tokens, state));

    await Promise.all(actions);
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
    const oldIp = oldSettings['ipAddress'] as string;
    const newIp = newSettings['ipAddress'] as string;
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
      this.log('disconnect from ' + ipAddress);
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

  async validateSelectedDashboardOption() {
    const selectedDashboardId = await this.getCapabilityValue('dashboard');
    const allDashboardIds = this.store.getDashboardMetadata().map((metadata) => metadata.id);
    if (selectedDashboardId === undefined || !allDashboardIds.includes(selectedDashboardId)) {
      this.loadEmptyDashboardOptions();
    }
  }

  async updateSelectableDashboardOptions() {
    const staticOptions = [
      {'id': this.emptyDashboard.id, 'title': { 'en': this.emptyDashboard.name } }
    ]
    const dynamicOptions = this.store
      .getDashboardMetadata()
      .map((dashboard) => ({'id': dashboard.id, 'title': { 'en': dashboard.name } }) );

    await this.setCapabilityOptions('dashboard', { values: staticOptions.concat(dynamicOptions) });
  }

  async loadEmptyDashboardOptions() {
      // set the first dashboard as new dashboard
      await this.setCapabilityValue('dashboard', this.emptyDashboard.id);

      // load the new dashboard
      await this.streamDeckLoadDashboard(this.streamDeck, this.emptyDashboard.id);

      // notifiy about the dashboard change
      await this.onDashboardChanged.trigger(this, { 'dashboard': this.emptyDashboard.name })
  }

  createAutocompleteValue(id: string, name: string, image: string | undefined = undefined) {
    return {
      id: id,
      name: name,
      description: '',
      image: image ?? ''
    }
  }
  
  registerImageAutocompleteListenerForCard(card: Homey.FlowCardTriggerDevice) {
    card.registerArgumentAutocompleteListener('image', (query: string, args: any) => {
      return this.store
      .getImages()
      .filter((image) => {
        return query.length == 0 || image.name.toLowerCase().includes(query.toLowerCase());
      })
      .sort()
      .map(button => {
        return this.createAutocompleteValue(button.id, button.name, button.base64Image);
      });
    });
  }
  
  registerImageButtonRunListener(card: Homey.FlowCardTriggerDevice) {
    card.registerRunListener((args, state) => {
      return args.image.id === state.imageId && args.action === state.action;
    });
  }
  
  registerAnyButtonRunListener(card: Homey.FlowCardTriggerDevice) {
    card.registerRunListener((args, state) => {
      return args.action === state.action;
    });
  }
  
  registerDashboardAutocompleteListenerForCard(card: Homey.FlowCardCondition | Homey.FlowCardAction) {
    card.registerArgumentAutocompleteListener('dashboard', (query: string, args: any) => {

      const selectableOptions = this.store.getDashboardMetadata().map(dashboard => {
        return this.createAutocompleteValue(dashboard.id, dashboard.name)
      }).sort();
      
      return [this.emptyDashboard]
        .concat(selectableOptions)
        .filter((option) => {
          return query.length == 0 || option.name.toLowerCase().includes(query.toLowerCase());
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
        throw 'Stream Deck is unavailable';
      }
      
      const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
      const dashboardId: string = args.dashboard.id;
      const dashboardName: string = args.dashboard.name;
      if (selectedDashboardId === dashboardId) {
        // value not changed
        return {};
      }
      await this.setCapabilityValue('dashboard', dashboardId);
      await this.onDashboardChanged.trigger(this, { 'dashboard': dashboardName });
      await this.streamDeckLoadDashboard(this.streamDeck, dashboardId);
      return {};
    });
  }

  map<A, B>(value: A | undefined, f: (value: A) => B): B | undefined {
    if (value === undefined) return undefined;
    return f(value);
  }
};
