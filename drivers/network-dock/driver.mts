import Homey from 'homey';

export default class NetworkDockDriver extends Homey.Driver {
  
  async onInit() {
    this.log('NetworkDockDriver has been initialized');
  }

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
