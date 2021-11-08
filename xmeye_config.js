module.exports = function (RED) {
  'use strict'
  let settings = RED.settings;
  const 
    xmeyecam = require('./lib/dvripclient'),
    utils = require('./utils');

  class XmeyeConfigNode {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.ip = config.ip;
      this.port = parseInt(config.port || 34567);
      this.user = config.user;
      this.password = config.password;
      this.timeout = parseInt(config.timeout || 5000);
      this.name = config.name;
      
      this.setMaxListeners(0); // by default only 10 listeners are allowed

      // Retrieve the config node, where the device is configured
      this.mynodeConfig = RED.nodes.getNode(config.mynodeConfig);

      this.on('close', this.onClose.bind(this));

      this.access = new xmeyecam({ this.ip, this.port, this.timeout });
    }

    onClose(done) {
      if (this.access) this.access.disconnect();
      setXmeyeStatus(this, '');
      this.removeAllListeners('xmeye_status');
      done();
    }

    setXmeyeStatus(status) {
      this.xmeyeStatus = status;
      // Pass the new status to all listeners
      this.emit('xmeye_status', status);
    }

    async connect() {
      if (!this.access) {
        console.error('cam access object missing for ' + this.name);
        return;
      }
    
      try {
        await this.access.connect();
        console.log("-- Connected!");
    
        await this.access.login({ Username: this.user, Password: this.password });
        console.log("-- Logged in!");
      }
      catch (e) {
        console.log("Failed (3):", e);
        this.access.disconnect();
      }
    }
    
  }

  RED.nodes.registerType('xmeye-config', XmeyeConfigNode);
}
