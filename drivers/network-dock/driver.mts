import Homey from 'homey';

export default class NetworkDockDriver extends Homey.Driver {
  
  async onInit() {
    this.log('NetworkDockDriver has been initialized');

    const discoveryStrategy = this.getDiscoveryStrategy();
    const logResults = () => {
      const results = Object.values(discoveryStrategy.getDiscoveryResults());
      this.log(`discovery: ${results.length} result(s)` + results.map((r) => ` [${r.id} at ${r.address}]`).join(''));
    };
    logResults();
    discoveryStrategy.on('result', logResults);
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
