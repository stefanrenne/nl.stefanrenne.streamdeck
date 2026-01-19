'use strict';

import Homey from 'homey';

module.exports = class StreamDeckApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('StreamDeckApp has been initialized');
  }

}
