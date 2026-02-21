import Homey from 'homey';
import { Store } from './lib/storage';
import { CardListener } from './lib/cardListener';

module.exports = class StreamDeckApp extends Homey.App {

  private store = new Store(this.homey);
  private cardListener = new CardListener(this.homey, this.store);
  
  async onInit() {
    this.log('StreamDeckApp has been initialized');
    this.store.cleanSettings();
    this.observeSettings();
    this.registerUpdateTextListener();
  }

  observeSettings() {
    this.homey.settings.on('set', async (key: string) => {
      const imageId = (key.startsWith('image-')) ? key.slice('image-'.length): undefined;
      const dashboardId = (key.startsWith('dashboard-')) ? key.slice('dashboard-'.length): undefined;
      if (imageId !== undefined) {
        this.log('set image: ' + imageId);
        this.homey.settings.emit('set-image', imageId);
      }
      if (dashboardId !== undefined) {
        this.log('set dashboard: ' + dashboardId);
        this.homey.settings.emit('set-dashboard', dashboardId);
      }
    });
    this.homey.settings.on('unset', async (key: string) => {
      const imageId = (key.startsWith('image-')) ? key.slice('image-'.length): undefined;
      const dashboardId = (key.startsWith('dashboard-')) ? key.slice('dashboard-'.length): undefined;
      if (imageId !== undefined) {
        this.log('unset image: ' + imageId);
        this.homey.settings.emit('unset-image', imageId);
      }
      if (dashboardId !== undefined) {
        this.log('unset dashboard: ' + dashboardId);
        this.homey.settings.emit('unset-dashboard', dashboardId);
      }
    });
  }

  registerUpdateTextListener() {
    const card = this.homey.flow.getActionCard('update_text');
    this.cardListener.registerTextAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      const value = (args.value !== undefined) ? args.value.trim() : '';
      this.store.updateTextButtonForDashboard(args.text.dashboardId, args.text.textId, value);
      return {};
    });
  }
}