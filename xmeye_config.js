module.exports = function (RED) {
  'use strict'
  var settings = RED.settings;
  const 
    //xmeyecam = require('./lib/dvripclient'),
    //sip?? utils = require('./utils');

  function XmeyeConfigNode(config) {
    console.log('--- enter XmeyeConfigNode');

    RED.nodes.createNode(this, config);

    this.ip = config.ip;
    this.port = parseInt(config.port || 34567);
    this.timeout = parseInt(config.timeout || 5000);
    this.name = config.name;
    
    this.setMaxListeners(0); // by default only 10 listeners are allowed

    this.on('close', function(done) {
      if (this.access) this.access.disconnect();
      setXmeyeStatus(this, '');
      this.removeAllListeners('xmeye_status');
      if (done) done();
    });

    this.setXmeyeStatus = function (status) {
      this.xmeyeStatus = status;
      // Pass the new status to all listeners
      this.emit('xmeye_status', status);
    }

    this.access = null; //sip++ new xmeyecam({ camIp: this.ip, camMediaPort: this.port, commandTimeoutMs: this.timeout });

    this.connect = async function() {
      if (!this.access) {
        this.error('cam access object missing for ' + this.name);
        return;
      }
    
      try {
        await this.access.connect();
        this.log("-- Connected!");
    
        await this.access.login({ Username: this.credentials.user, Password: this.credentials.password });
        this.log("-- Logged in!");
      }
      catch (e) {
        this.log("Failed (3):", e);
        this.access.disconnect();
      }
    }
    console.log('--- leave XmeyeConfigNode');
  }

  RED.nodes.registerType('xmeye-config', XmeyeConfigNode, {
    credentials: {
      user: {type:"text"},
      password: {type: "password"}
    }
  });
}
