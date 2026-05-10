import Homey, { DiscoveryResultMDNSSD, FlowCardTriggerDevice } from 'homey';
import type { StreamDeckButtonControlDefinition, StreamDeckButtonControlDefinitionLcdFeedback } from '@elgato-stream-deck/core'
import { StreamDeckTcpConnectionManager, StreamDeckTcp } from '@elgato-stream-deck/tcp'
import { Dashboard, Store } from '../../lib/storage';
import { CardListener } from '../../lib/cardListener';
import { getButtonControlSize, renderText, renderDashboard, renderHomeyLogo } from '../../lib/streamDeckAdapter';
import { map } from '../../lib/helpers';

module.exports = class NetworkDock extends Homey.Device {

  private store = new Store(this.homey);
  private cardListener = new CardListener(this.homey, this.store);
  private connectionManager = new StreamDeckTcpConnectionManager();
  private streamDeck: StreamDeckTcp | undefined;
  private dashboard: Dashboard | undefined;
  
  private onOffButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('off_button_action');
  private onImageButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('image_button_action');
  private onVariableButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('variable_button_action');
  private onAnyButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('any_button_action');
  private onDashboardChanged: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard('changed_dashboard');

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.cardListener.registerImageAutocompleteListenerForCard(this.onImageButtonAction);
    this.cardListener.registerImageButtonRunListener(this.onImageButtonAction);
    this.cardListener.registerVariableAutocompleteListenerForCard(this.onVariableButtonAction);
    this.cardListener.registerVariableButtonRunListener(this.onVariableButtonAction);
    this.cardListener.registerAnyButtonRunListener(this.onAnyButtonAction);
    this.registerIsDashboardListener();
    this.registerChangeDashboardListener();

    await this.updateSelectableDashboardOptions();
    await this.validateSelectedDashboardOption();

    this.connectionManager.on('error', async (message) => {
        await this.setUnavailable(message);
    });

    this.connectionManager.on('connected', async (streamDeck) => {
      this.log('connectionManager - connected');

      if (streamDeck.CONTROLS.length > 0) {
        this.streamDeck = streamDeck
        await this.setAvailable();
        this.streamDeckDidConnect(streamDeck);

        const dashboardId: string = await this.getCapabilityValue('dashboard') ?? this.cardListener.emptyDashboard.id;
        await this.loadDashboard(dashboardId);
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
        await this.loadDashboard(id);
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

    this.homey.settings.on('set-variable', async (id: string) => {
      this.store.invalidateVariable(id);
      const control = await this.getDisplayedControlForVariable(id);
      if (control !== undefined && this.streamDeck !== undefined) {
        const variable = this.store.getVariable(id);
        if (variable === undefined) {
          await this.streamDeck.clearKey(control.index);
        } else {
          await renderText(this.streamDeck, control, variable.firstLine, variable.secondLine, variable.textColor, variable.backgroundColor);
        }
      }
    });

    this.homey.settings.on('unset-variable', async (id: string) => {
      this.store.invalidateVariable(id);
      const control = await this.getDisplayedControlForVariable(id);
      if (control !== undefined) {
        await this.streamDeck?.clearKey(control.index);
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

    this.registerCapabilityListener('dashboard', async (id: string) => {
      await this.loadDashboard(id);
      const dashboardName = (id === this.cardListener.emptyDashboard.id) ? this.cardListener.emptyDashboard.name : this.store.getDashboard(id)?.name
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
        if (control.type === 'button') {
          await this.streamDeckEvent('down', this.getCapabilityValue('onoff'), control);
        }
      });

      streamDeck.on('up', async (control) => {
        if (control.type === 'button') {
          await this.streamDeckEvent('up', this.getCapabilityValue('onoff'), control);
        }
      });

      const size = getButtonControlSize(streamDeck);
      await this.setSettings({
        name: streamDeck.PRODUCT_NAME,
        serial: await streamDeck.getSerialNumber(),
        firmware: await streamDeck.getFirmwareVersion(),
        columns: size.columns,
        rows: size.rows
      });
  }

  async getDisplayedControlForVariable(variableId: string) {
    if (this.streamDeck === undefined) {
      return undefined;
    }
    const dashboard: Dashboard | undefined = map(await this.getCapabilityValue('dashboard'), (dashboardId) => this.store.getDashboard(dashboardId));
    if (dashboard === undefined) {
      return undefined;
    }

    const controls = this.streamDeck.CONTROLS.map((control) => control as StreamDeckButtonControlDefinitionLcdFeedback)
    for (const [i, control] of controls.entries()) {
      const item = dashboard.items[i+1];
      if (item.kind === 'variable' && item.variableId === variableId) {
        return control
      }
    }
    return undefined
  }

  async loadDashboard(id: string) {
    if (this.streamDeck === undefined) {
      this.dashboard = undefined;
      return
    }
    const dashboard: Dashboard | undefined = (id === this.cardListener.emptyDashboard.id) ? undefined : this.store.getDashboard(id);
    if (dashboard === undefined) {
      this.dashboard = undefined;
      renderHomeyLogo(this.streamDeck);
      return
    }

    // Validate if the loaded dashboard has the correct number of buttons (6, 15 or 32)
    const size = getButtonControlSize(this.streamDeck);
    if (dashboard.columns != size.columns || dashboard.rows != size.rows) {
      this.store.updateDashboard(dashboard.id, size.columns, size.rows);
    }

    this.dashboard = dashboard;
    await renderDashboard(this.streamDeck, dashboard);
  }

  private lastKeyPressTime: number = 0;
  private lastKeyPressIndex: number = 0;
  validateSingleDouble(control: StreamDeckButtonControlDefinition) {
    const thisKeyPressTime = new Date().getTime();
    if (thisKeyPressTime - this.lastKeyPressTime <= 250 && this.lastKeyPressIndex == control.index+1) {
      this.streamDeckEvent('double', true, control).catch((e) => console.error('double event failed:', e));
      this.lastKeyPressTime = 0;
      this.lastKeyPressIndex = 0;
    } else {
      this.lastKeyPressTime = thisKeyPressTime;
      this.lastKeyPressIndex = control.index+1;
      new Promise<void>((resolve) => {
        setTimeout(function() {
          resolve()
        }, 400);
      })
      .then(() => {
        if (this.lastKeyPressTime > 0) {
          this.streamDeckEvent('single', true, control).catch((e) => console.error('single event failed:', e));;
        }
      });
    }
  }

  async streamDeckEvent(event: 'up' | 'down' | 'single' | 'double', isTurnedOn: Boolean, control: StreamDeckButtonControlDefinition) {

    const button = this.dashboard?.items[control.index+1];
    var state = { action: event, variableId: '', imageId: '' }
    var tokens = { dashboard: this.dashboard?.name ?? '', imageName: '', textFirstLine: '', textSecondLine: '', payload: button?.payload ?? '', column: control.column + 1, row: control.row + 1 }
    
    if (!isTurnedOn) {
      await this.onOffButtonAction.trigger(this, tokens, state);
      this.log(event + ' disabled button');
      return
    }

    if (button === undefined || this.dashboard?.name === undefined) {
      this.log(event + ' empty dashboard button');
      return
    }

    if (event === 'down') {
      this.validateSingleDouble(control);
    }

    var actions: Promise<void>[] = []

    switch (button.kind) {
    case 'variable':
      state.variableId = button.variableId;
      tokens.textFirstLine = button.firstLine;
      tokens.textSecondLine = button.secondLine ?? '';
      actions.push(this.onVariableButtonAction.trigger(this, tokens, state));
      this.log(event + ' variable button ' + button.firstLine);
      break; 
    case 'image':
      state.imageId = button.imageId;
      tokens.imageName = button.name;
      actions.push(this.onImageButtonAction.trigger(this, tokens, state));
      this.log(event + ' image button ' + button.name);
      break; 
    default:
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
    if (changedKeys.includes('ipAddress')) {
      const oldIp = oldSettings['ipAddress'] as string;
      const newIp = newSettings['ipAddress'] as string;
      if (oldIp !== newIp) {
        await this.streamDeck?.clearPanel();
        this.connectionManager.disconnectFrom(oldIp);
        this.connectionManager.connectTo(newIp);
      }
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

  async validateSelectedDashboardOption() {
    const selectedDashboardId = await this.getCapabilityValue('dashboard');
    const allDashboardIds = this.store.getDashboardMetadata().map((metadata) => metadata.id);
    if (selectedDashboardId === undefined || !allDashboardIds.includes(selectedDashboardId)) {
      this.loadEmptyDashboardOptions();
    }
  }

  async updateSelectableDashboardOptions() {
    const staticOptions = [
      {'id': this.cardListener.emptyDashboard.id, 'title': { 'en': this.cardListener.emptyDashboard.name } }
    ]
    const dynamicOptions = this.store
      .getDashboardMetadata()
      .map((dashboard) => ({'id': dashboard.id, 'title': { 'en': dashboard.name } }) );

    await this.setCapabilityOptions('dashboard', { values: staticOptions.concat(dynamicOptions) });
  }

  async loadEmptyDashboardOptions() {
      // set the first dashboard as new dashboard
      await this.setCapabilityValue('dashboard', this.cardListener.emptyDashboard.id);

      // load the new dashboard
      await this.loadDashboard(this.cardListener.emptyDashboard.id);

      // notifiy about the dashboard change
      await this.onDashboardChanged.trigger(this, { 'dashboard': this.cardListener.emptyDashboard.name })
  }

  registerIsDashboardListener() {
    const card = this.homey.flow.getConditionCard('is_dashboard');
    this.cardListener.registerDashboardAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
      const dashboardId: string = args.dashboard.id;
      return selectedDashboardId === dashboardId;
    });
  }

  registerChangeDashboardListener() {
    const card = this.homey.flow.getActionCard('set_dashboard');
    this.cardListener.registerDashboardAutocompleteListenerForCard(card);
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
      await this.loadDashboard(dashboardId);
      return {};
    });
  }

  /**
   * Discovery result update
   */
  onDiscoveryResult(discoveryResult: DiscoveryResultMDNSSD) {
    return discoveryResult.id === this.getData().id;
  }

  async onDiscoveryAvailable(discoveryResult: DiscoveryResultMDNSSD) {
    const ipAddress = this.getSetting('ipAddress');
    this.connectionManager.connectTo(ipAddress)
  }

  onDiscoveryAddressChanged(discoveryResult: DiscoveryResultMDNSSD) {
    console.log("onDiscoveryAddressChanged to " + discoveryResult.address);
    this.setSettings({'ipAddress': discoveryResult.address}).catch((e) => console.error('update ipAddress failed:', e));
  }
};
