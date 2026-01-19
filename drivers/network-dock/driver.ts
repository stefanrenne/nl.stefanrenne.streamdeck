import Homey from 'homey';

module.exports = class NetworkDockDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('NetworkDockDriver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    const discoveryStrategy = this.getDiscoveryStrategy();
    const discoveryResults = Object.values(discoveryStrategy.getDiscoveryResults());

    return Object.values(discoveryResults)
    .map(discoveryResult => {
      return {
        name: discoveryResult.id,
        data: {
          id: discoveryResult.id
        },
        settings: {
          ipAddress: discoveryResult.address,
        },
      };
    })
  }

};
