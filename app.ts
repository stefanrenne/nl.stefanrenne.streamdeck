import Homey from 'homey';
import { Store } from './lib/storage';

module.exports = class StreamDeckApp extends Homey.App {

  private store = new Store(this.homey);
  strategy = this.homey.discovery.getStrategy('studio');
  
  async onInit() {
    this.log('StreamDeckApp has been initialized');
    this.store.cleanSettings();
    this.observeSettings();
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
}