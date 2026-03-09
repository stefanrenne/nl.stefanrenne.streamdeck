import Homey from 'homey';
import { Store } from './lib/storage';
import { CardListener } from './lib/cardListener';
import { TextToImage } from './lib/textToImage';

module.exports = class StreamDeckApp extends Homey.App {

  private store = new Store(this.homey);
  private cardListener = new CardListener(this.homey, this.store);
  
  async onInit() {
    this.log('StreamDeckApp has been initialized');
    this.store.cleanSettings();
    this.observeSettings();
    this.registerUpdateVariableListener();
    this.registerUpdateVariableFirstLineTextListener();
    this.registerUpdateVariableSecondLineTextListener();
  }

  observeSettings() {
    this.homey.settings.on('set', async (key: string) => {
      const imageId = (key.startsWith('image-')) ? key.slice('image-'.length): undefined;
      const dashboardId = (key.startsWith('dashboard-')) ? key.slice('dashboard-'.length): undefined;
      const variableId = (key.startsWith('variable-')) ? key.slice('variable-'.length): undefined;
      if (imageId !== undefined) {
        this.log('set image: ' + imageId);
        this.homey.settings.emit('set-image', imageId);
      }
      if (dashboardId !== undefined) {
        this.log('set dashboard: ' + dashboardId);
        this.homey.settings.emit('set-dashboard', dashboardId);
      }
      if (variableId !== undefined) {
        this.log('set variable: ' + variableId);
        this.store.invalidateVariable(variableId);
        this.homey.settings.emit('set-variable', variableId);
      }
    });
    this.homey.settings.on('unset', async (key: string) => {
      const imageId = (key.startsWith('image-')) ? key.slice('image-'.length): undefined;
      const dashboardId = (key.startsWith('dashboard-')) ? key.slice('dashboard-'.length): undefined;
      const variableId = (key.startsWith('variable-')) ? key.slice('variable-'.length): undefined;
      if (imageId !== undefined) {
        this.log('unset image: ' + imageId);
        this.homey.settings.emit('unset-image', imageId);
      }
      if (dashboardId !== undefined) {
        this.log('unset dashboard: ' + dashboardId);
        this.homey.settings.emit('unset-dashboard', dashboardId);
      }
      if (variableId !== undefined) {
        this.log('unset variable: ' + variableId);
        this.store.invalidateVariable(variableId);
        this.homey.settings.emit('unset-variable', variableId);
      }
    });
  }

  registerUpdateVariableListener() {
    const card = this.homey.flow.getActionCard('update_variable');
    this.cardListener.registerVariableAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      const id = args.variable.id;
      const firstLine = args.firstLine.trim();
      const secondLine = args.secondLine.trim();
      const variable = this.store.getVariable(id);

      if (variable !== undefined) {
        const jimp = await TextToImage.create(TextToImage.sampleSize, firstLine, secondLine, variable.textColor, variable.backgroundColor);
        const sample = await jimp.getBase64("image/jpeg", { quality: 0.8, });
        this.store.setVariable(id, firstLine, secondLine, variable.textColor, variable.backgroundColor, sample);
      }
      return {};
    });
  }

  registerUpdateVariableFirstLineTextListener() {
    const card = this.homey.flow.getActionCard('update_variable_firstline');
    this.cardListener.registerVariableAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      const id = args.variable.id;
      const firstLine = args.firstLine.trim();
      const variable = this.store.getVariable(id);
      
      if (variable !== undefined) {
        const jimp = await TextToImage.create(TextToImage.sampleSize, firstLine, variable.secondLine, variable.textColor, variable.backgroundColor);
        const sample = await jimp.getBase64("image/jpeg", { quality: 0.8, });
        this.store.setVariable(id, firstLine, variable.secondLine, variable.textColor, variable.backgroundColor, sample);
      }
      return {};
    });
  }

  registerUpdateVariableSecondLineTextListener() {
    const card = this.homey.flow.getActionCard('update_variable_secondline');
    this.cardListener.registerVariableAutocompleteListenerForCard(card);
    card.registerRunListener(async (args) => {
      const id = args.variable.id;
      const secondLine = (args.secondLine !== undefined) ? args.secondLine.trim() : undefined;
      const variable = this.store.getVariable(id);
      
      if (variable !== undefined) {
        const jimp = await TextToImage.create(TextToImage.sampleSize, variable.firstLine, secondLine, variable.textColor, variable.backgroundColor);
        const sample = await jimp.getBase64("image/jpeg", { quality: 0.8, });
        this.store.setVariable(id, variable.firstLine, secondLine, variable.textColor, variable.backgroundColor, sample);
      }
      return {};
    });
  }
}