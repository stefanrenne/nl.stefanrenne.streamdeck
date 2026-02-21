'use strict';

module.exports = {
  async discovery({ homey, query }) {
    return homey.app.strategy.getDiscoveryResults();
  },
};
