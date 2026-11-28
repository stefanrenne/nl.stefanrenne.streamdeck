import Homey, { FlowCardTriggerDevice } from 'homey';
import type { StreamDeckButtonControlDefinition } from '@elgato-stream-deck/core'
import { Dashboard, DashboardNavigation, Store } from './storage.mjs';
import { CardListener } from './cardListener.mjs';
import { DeckSurface, getButtonControlSize, getDashboardItem, getLcdButtonControls, renderText, renderDashboard, renderHomeyLogo } from './streamDeckAdapter.mjs';
import { map } from './helpers.mjs';

/**
 * Everything a Stream Deck device does that doesn't depend on how the deck is attached: the
 * capabilities, the dashboards, redrawing on settings changes, and turning key presses into Flow
 * triggers. A subclass attaches a deck with `deckDidConnect` and passes its key presses to
 * `streamDeckEvent`.
 */
export default class StreamDeckDevice<Deck extends DeckSurface = DeckSurface> extends Homey.Device {

  protected store = new Store(this.homey);
  protected cardListener = new CardListener(this.homey, this.store);
  protected streamDeck: Deck | undefined;
  private dashboard: Dashboard | undefined;

  /**
   * The dashboards that were left by an `open` navigation, newest last, each with the timeout it
   * was shown with, and the timeout of the dashboard shown now (0: it stays). Kept in the device
   * store, so a restart in the middle of a temporary dashboard still returns. See docs/device.md.
   */
  private navigation: NavigationState = { history: [], timeout: 0 };
  private navigationTimer: ReturnType<typeof setTimeout> | undefined;
  /** The dashboard of each key's last 'down', so its 'up'/'single'/'double' belong to the same dashboard. */
  private pressedDashboards = new Map<number, Dashboard | undefined>();

  private onOffButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard(this.flowCardId('off_button_action'));
  private onImageButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard(this.flowCardId('image_button_action'));
  private onVariableButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard(this.flowCardId('variable_button_action'));
  private onAnyButtonAction: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard(this.flowCardId('any_button_action'));
  private onDashboardChanged: FlowCardTriggerDevice = this.homey.flow.getDeviceTriggerCard(this.flowCardId('changed_dashboard'));

  /**
   * The id of this driver's copy of a device Flow card. A device argument's filter takes only one
   * driver_id, so every driver has its own copy (driver.flow.compose.json, built from the templates
   * in .homeycompose/drivers/flow). The Network Dock's keep the original ids, so existing Flows work.
   * Called from the field initializers above, so an override must not use instance fields.
   */
  protected flowCardId(id: string): string {
    return id;
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.cardListener.registerImageAutocompleteListenerForCard(this.onImageButtonAction);
    this.cardListener.registerImageButtonRunListener(this.onImageButtonAction);
    this.cardListener.registerVariableAutocompleteListenerForCard(this.onVariableButtonAction);
    this.cardListener.registerVariableButtonRunListener(this.onVariableButtonAction);
    this.cardListener.registerAnyButtonRunListener(this.onAnyButtonAction);
    this.cardListener.registerAnyButtonRunListener(this.onOffButtonAction);
    this.registerIsDashboardListener();
    this.registerChangeDashboardListener();

    await this.updateSelectableDashboardOptions();
    this.navigation = toNavigationState(this.getStoreValue(NAVIGATION_STORE_KEY));
    await this.validateSelectedDashboardOption();
    // After a restart on a temporary dashboard, its timeout starts again.
    this.startNavigationTimer();

    this.homey.settings.on('set-dashboard', this.guard('set-dashboard', async (id: string) => {
      this.store.invalidateDashboard(id);
      await this.updateSelectableDashboardOptions();

      const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
      if (selectedDashboardId === id) {
        this.log('selected dashboard updated');
        await this.loadDashboard(id);
      }
    }));

    this.homey.settings.on('unset-dashboard', this.guard('unset-dashboard', async (id: string) => {
      const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
      if (selectedDashboardId === id) {
        this.log('selected dashboard removed');
        await this.loadEmptyDashboardOptions();
      }

      this.store.invalidateDashboard(id);
      await this.updateSelectableDashboardOptions();
    }));

    this.homey.settings.on('set-image', this.guard('set-image', async (id: string) => {
      this.store.invalidateImage(id);
    }));

    this.homey.settings.on('unset-image', this.guard('unset-image', async (id: string) => {
      this.store.invalidateImage(id);
    }));

    this.homey.settings.on('set-variable', this.guard('set-variable', async (id: string) => {
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
    }));

    this.homey.settings.on('unset-variable', this.guard('unset-variable', async (id: string) => {
      this.store.invalidateVariable(id);
      const control = await this.getDisplayedControlForVariable(id);
      if (control !== undefined) {
        await this.streamDeck?.clearKey(control.index);
      }
    }));

    this.registerCapabilityListener('onoff', async (value: boolean) => {
      const dim: number = value ? 1.0 : 0.0;
      await this.applyBrightness(dim);
      await this.setCapabilityValue('dim', dim);
    });

    this.registerCapabilityListener('dim', async (value: number) => {
      await this.applyBrightness(value);
      await this.setCapabilityValue('onoff', value > 0);
    });

    this.registerCapabilityListener('dashboard', async (id: string) => {
      await this.clearNavigation();
      await this.loadDashboard(id);
      const dashboardName = (id === this.cardListener.emptyDashboard.id) ? this.cardListener.emptyDashboard.name : this.store.getDashboard(id)?.name
      if (dashboardName) {
        await this.onDashboardChanged.trigger(this, { 'dashboard': dashboardName });
      }
    });
  }

  /**
   * Wraps an async event listener. An EventEmitter doesn't await its listeners, so a rejection
   * (for example `Disconnected` when the dock drops while a key is being drawn) would be unhandled
   * and crash the app. It is logged instead.
   */
  guard<Args extends unknown[]>(event: string, listener: (...args: Args) => Promise<void>): (...args: Args) => void {
    return (...args: Args) => {
      listener(...args).catch((e) => this.log(`${event} failed: ${e}`));
    };
  }

  async applyBrightness(dim: number) {
    await this.streamDeck?.setBrightness(Math.round(dim * 100));
  }

  /**
   * Takes `streamDeck` into use: sends the current brightness and draws the selected dashboard.
   */
  async deckDidConnect(streamDeck: Deck) {
    this.streamDeck = streamDeck;

    // Homey's dim value is only sent when it changes, so after a reconnect
    // or power cycle the deck would keep its own brightness. A failure
    // here must not stop the dashboard from loading.
    const on: boolean = this.getCapabilityValue('onoff') ?? true;
    await this.applyBrightness(on ? this.getCapabilityValue('dim') ?? 1 : 0)
      .catch((e) => this.log('setBrightness failed: ' + e));

    const dashboardId: string = await this.getCapabilityValue('dashboard') ?? this.cardListener.emptyDashboard.id;
    await this.loadDashboard(dashboardId);
  }

  async getDisplayedControlForVariable(variableId: string) {
    if (this.streamDeck === undefined) {
      return undefined;
    }
    const dashboard: Dashboard | undefined = map(await this.getCapabilityValue('dashboard'), (dashboardId) => this.store.getDashboard(dashboardId));
    if (dashboard === undefined) {
      return undefined;
    }

    const controls = getLcdButtonControls(this.streamDeck)
    for (const control of controls) {
      const item = getDashboardItem(dashboard, control);
      if (item?.kind === 'variable' && item.variableId === variableId) {
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
    let dashboard: Dashboard | undefined = (id === this.cardListener.emptyDashboard.id) ? undefined : this.store.getDashboard(id);
    if (dashboard === undefined) {
      this.dashboard = undefined;
      await renderHomeyLogo(this.streamDeck);
      return
    }

    // A deck larger than the dashboard grows it to the deck's size, so every key can be filled in the
    // settings page. Never shrink: with decks of different sizes on one dashboard, each would resize it
    // for the other, and every write redraws both, endlessly (regression ec7db59). The sizes (3×2, 4×2,
    // 5×3, 8×4) are ordered, so the dashboard settles at the largest deck; a smaller deck shows its
    // top-left part (getDashboardItem).
    const size = getButtonControlSize(this.streamDeck);
    if (size.columns > dashboard.columns || size.rows > dashboard.rows) {
      this.store.updateDashboard(dashboard.id, size.columns, size.rows);
      dashboard = this.store.getDashboard(id) ?? dashboard;
    }

    this.dashboard = dashboard;
    await renderDashboard(this.streamDeck, dashboard);
  }

  /**
   * Whether this device tells a single from a double press itself, from when the downs arrive. A deck
   * whose presses arrive late and unevenly (the virtual deck's widget, over HTTP) times them where
   * they happen and sends 'single'/'double' itself instead.
   */
  protected detectsSingleDouble(): boolean {
    return true;
  }

  private lastKeyPressTime: number = 0;
  private lastKeyPressIndex: number = 0;
  // isTurnedOn is the state at the press, so a 'single'/'double' goes to the same cards as its 'down'.
  private lastKeyPressDashboardId: string | undefined;
  // isTurnedOn is the state at the press, so a 'single'/'double' goes to the same cards as its 'down'.
  // dashboard is the one the press was on: a navigation key has already switched to another one.
  validateSingleDouble(control: StreamDeckButtonControlDefinition, isTurnedOn: boolean, dashboard: Dashboard | undefined = this.dashboard) {
    const thisKeyPressTime = new Date().getTime();
    if (thisKeyPressTime - this.lastKeyPressTime <= 250 && this.lastKeyPressIndex == control.index+1 && this.lastKeyPressDashboardId === dashboard?.id) {
      this.streamDeckEvent('double', isTurnedOn, control, dashboard).catch((e) => console.error('double event failed:', e));
      this.lastKeyPressTime = 0;
      this.lastKeyPressIndex = 0;
    } else {
      this.lastKeyPressTime = thisKeyPressTime;
      this.lastKeyPressIndex = control.index+1;
      this.lastKeyPressDashboardId = dashboard?.id;
      // homey.setTimeout is cleared when the app unloads, so no 'single' fires after that.
      this.homey.setTimeout(() => {
        if (this.lastKeyPressTime > 0) {
          this.streamDeckEvent('single', isTurnedOn, control, dashboard).catch((e) => console.error('single event failed:', e));
        }
      }, 400);
    }
  }

  /**
   * `dashboard` is the dashboard the press belongs to. By default a 'down' uses the one shown now, and
   * the 'up', 'single' and 'double' after it use that same one, even when the 'down' navigated away.
   */
  async streamDeckEvent(event: 'up' | 'down' | 'single' | 'double', isTurnedOn: boolean, control: StreamDeckButtonControlDefinition, dashboard: Dashboard | undefined = this.dashboardForEvent(event, control)) {

    const button = map(dashboard, (dashboard) => getDashboardItem(dashboard, control));
    const state = { action: event, variableId: '', imageId: '' }
    const tokens = { dashboard: dashboard?.name ?? '', imageName: '', textFirstLine: '', textSecondLine: '', payload: button?.payload ?? '', column: control.column + 1, row: control.row + 1, item: String.fromCharCode(64 + control.row + 1) + String(control.column + 1) }

    if (!isTurnedOn) {
      if (event === 'down' && this.detectsSingleDouble()) {
        this.validateSingleDouble(control, false);
      }
      await this.onOffButtonAction.trigger(this, tokens, state);
      this.log(event + ' disabled button');
      return
    }

    if (button === undefined || dashboard?.name === undefined) {
      this.log(event + ' empty dashboard button');
      return
    }

    if (event === 'down' && this.detectsSingleDouble()) {
      this.validateSingleDouble(control, true, dashboard);
    }

    const actions: Promise<void>[] = []

    if (event === 'down') {
      // A press on a temporary dashboard keeps it open for another full timeout.
      this.startNavigationTimer();
      if (button.navigation !== undefined) {
        actions.push(this.navigate(button.navigation));
      }
    }

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

  /** The dashboard of the press an event belongs to; a 'down' starts a new press on the shown dashboard. */
  private dashboardForEvent(event: 'up' | 'down' | 'single' | 'double', control: StreamDeckButtonControlDefinition): Dashboard | undefined {
    if (event === 'down' || !this.pressedDashboards.has(control.index)) {
      this.pressedDashboards.set(control.index, this.dashboard);
    }
    return this.pressedDashboards.get(control.index);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('device has been added');
    await this.setCapabilityValue('dim', 1.0);
    await this.setCapabilityValue('onoff', true);
  }

  async validateSelectedDashboardOption() {
    const selectedDashboardId = await this.getCapabilityValue('dashboard');
    const allDashboardIds = this.store.getDashboardMetadata().map((metadata) => metadata.id);
    if (selectedDashboardId === undefined || !allDashboardIds.includes(selectedDashboardId)) {
      await this.loadEmptyDashboardOptions();
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
      await this.clearNavigation();

      // set the first dashboard as new dashboard
      await this.setCapabilityValue('dashboard', this.cardListener.emptyDashboard.id);

      // load the new dashboard
      await this.loadDashboard(this.cardListener.emptyDashboard.id);

      // notifiy about the dashboard change
      await this.onDashboardChanged.trigger(this, { 'dashboard': this.cardListener.emptyDashboard.name })
  }

  // A card has one run listener for all devices (the last device to register it wins), so the
  // listeners act on the device in the card's args, never on `this`.
  registerIsDashboardListener() {
    const card = this.homey.flow.getConditionCard(this.flowCardId('is_dashboard'));
    this.cardListener.registerDashboardAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      const device: StreamDeckDevice = args.device;
      const selectedDashboardId: string | undefined = await device.getCapabilityValue('dashboard');
      const dashboardId: string = args.dashboard.id;
      return selectedDashboardId === dashboardId;
    });
  }

  registerChangeDashboardListener() {
    const card = this.homey.flow.getActionCard(this.flowCardId('set_dashboard'));
    this.cardListener.registerDashboardAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      const device: StreamDeckDevice = args.device;
      await device.selectDashboard(args.dashboard.id, args.dashboard.name);
      return {};
    });
  }

  async selectDashboard(dashboardId: string, dashboardName: string) {
    if (!this.getAvailable()) {
      throw 'Stream Deck is unavailable';
    }

    // A dashboard chosen by a Flow is not temporary, and isn't left with 'back'.
    await this.clearNavigation();

    const selectedDashboardId: string | undefined = await this.getCapabilityValue('dashboard');
    if (selectedDashboardId === dashboardId) {
      // value not changed
      return;
    }
    await this.showDashboard(dashboardId, dashboardName);
  }

  /** Selects, triggers `changed_dashboard` for, and draws a dashboard, without touching the navigation. */
  private async showDashboard(dashboardId: string, dashboardName: string) {
    await this.setCapabilityValue('dashboard', dashboardId);
    await this.onDashboardChanged.trigger(this, { 'dashboard': dashboardName });
    await this.loadDashboard(dashboardId);
  }

  /** The name of a dashboard that can be selected, or undefined when it no longer exists. */
  private selectableDashboardName(id: string): string | undefined {
    if (id === this.cardListener.emptyDashboard.id) {
      return this.cardListener.emptyDashboard.name;
    }
    return this.store.getDashboardMetadata().find((metadata) => metadata.id === id)?.name;
  }

  /** Carries out a key's navigation (see `DashboardNavigation`). */
  async navigate(navigation: DashboardNavigation) {
    if (navigation.kind === 'back') {
      await this.navigateBack();
      return;
    }

    const currentId: string = this.getCapabilityValue('dashboard') ?? this.cardListener.emptyDashboard.id;
    const name = this.selectableDashboardName(navigation.dashboardId);
    if (name === undefined || navigation.dashboardId === currentId) {
      this.log(`navigation to ${navigation.dashboardId} ignored: ${name === undefined ? 'no such dashboard' : 'already shown'}`);
      return;
    }

    this.navigation = {
      history: [...this.navigation.history, { dashboardId: currentId, timeout: this.navigation.timeout }].slice(-MAX_NAVIGATION_HISTORY),
      timeout: navigation.timeout,
    };
    await this.saveNavigation();
    this.startNavigationTimer();
    await this.showDashboard(navigation.dashboardId, name);
  }

  /** Returns to the dashboard the current one was opened from. Does nothing without one. */
  async navigateBack() {
    const history = [...this.navigation.history];
    let entry = history.pop();
    // Skip dashboards that were deleted since.
    while (entry !== undefined && this.selectableDashboardName(entry.dashboardId) === undefined) {
      entry = history.pop();
    }
    if (entry === undefined) {
      this.log('navigation back ignored: no previous dashboard');
      await this.clearNavigation();
      return;
    }

    this.navigation = { history, timeout: entry.timeout };
    await this.saveNavigation();
    this.startNavigationTimer();
    await this.showDashboard(entry.dashboardId, this.selectableDashboardName(entry.dashboardId) ?? '');
  }

  /** (Re)starts the timer that returns from a temporary dashboard, or stops it for one that stays. */
  private startNavigationTimer() {
    if (this.navigationTimer !== undefined) {
      this.homey.clearTimeout(this.navigationTimer);
      this.navigationTimer = undefined;
    }
    if (this.navigation.timeout <= 0 || this.navigation.history.length === 0) {
      return;
    }
    // homey.setTimeout is cleared when the app unloads; the stored state restarts it on init.
    this.navigationTimer = this.homey.setTimeout(() => {
      this.navigationTimer = undefined;
      this.log('navigation timeout');
      this.navigateBack().catch((e) => this.log('navigation timeout failed: ' + e));
    }, this.navigation.timeout * 1000);
  }

  /** Forgets the navigation history: the current dashboard is no longer temporary. */
  private async clearNavigation() {
    if (this.navigation.history.length === 0 && this.navigation.timeout === 0 && this.navigationTimer === undefined) {
      return;
    }
    this.navigation = { history: [], timeout: 0 };
    this.startNavigationTimer();
    await this.saveNavigation();
  }

  private async saveNavigation() {
    await this.setStoreValue(NAVIGATION_STORE_KEY, this.navigation)
      .catch((e: unknown) => this.log('saving the navigation failed: ' + e));
  }
};

const NAVIGATION_STORE_KEY = 'navigation';
/** More than enough for any real menu, and keeps a loop of 'open' keys from growing the store. */
const MAX_NAVIGATION_HISTORY = 20;

interface NavigationEntry {
  dashboardId: string;
  timeout: number;
}

interface NavigationState {
  history: NavigationEntry[];
  timeout: number;
}

const toTimeout = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0) ? value : 0;

/** The stored navigation state, or an empty one for anything else (nothing stored yet). */
export function toNavigationState(value: unknown): NavigationState {
  const stored = (typeof value === 'object' && value !== null) ? value as Partial<Record<keyof NavigationState, unknown>> : {};
  const history = Array.isArray(stored.history) ? stored.history : [];
  return {
    history: history
      .filter((entry): entry is { dashboardId: string, timeout?: unknown } => typeof entry?.dashboardId === 'string')
      .map((entry) => ({ dashboardId: entry.dashboardId, timeout: toTimeout(entry.timeout) })),
    timeout: toTimeout(stored.timeout),
  };
}
