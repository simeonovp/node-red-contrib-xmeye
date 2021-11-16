module.exports = function (RED) {
  'use strict'
  //?? let settings = RED.settings;
  const 
    xmeyecam = require('./lib/dvripclient')
    //sip?? , utils = require('./utils')
    ;

  class XmeyeConfigNode {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.ip = config.ip;
      this.port = parseInt(config.port || 34567);
      this.user = config.user || this.credentials.user;
      this.password = config.password || this.credentials.password;
      this.timeout = parseInt(config.timeout || 5000);
      this.name = config.name;
      
      this.setMaxListeners(0); // by default only 10 listeners are allowed

      this.on('close', this.onClose.bind(this));

      this.access = null;
    }

    initialize() {
      if (this.access) return;

      if (!this.ip) {
        this.error( "Cannot connect due to IP of the Xmeye device not configured", {} );
           
        this.access = null;
        this.setStatus('unconfigured');
        return;
      }

      this.setStatus('initializing');
      this.access = new xmeyecam({ camIp: this.ip, camMediaPort: this.port, commandTimeoutMs: this.timeout });
      
      this.connect();
    }

    onClose(done) {
      this.log('--- enter XmeyeConfigNode onClose');
      if (this.access) this.access.disconnect();
      this.setStatus(this, '');
      this.removeAllListeners('xmeye_status');
      if (done) done();
    }

    setStatus(status) {
      this.log('--- enter XmeyeConfigNode setXmeyeStatus');
      this.xmeyeStatus = status;
      // Pass the new status to all listeners
      this.emit('xmeye_status', status);
    }

    async connect() {
      this.log('--- enter XmeyeConfigNode connect');
      if (!this.access) {
        this.error('cam access object missing for ' + this.name);
        return;
      }
    
      try {
        await this.access.connect();
        this.setStatus('login');
        this.log("Connected!");
    
        await this.access.login({ Username: this.user, Password: this.password });
        this.setStatus('connected');
        this.log("Logged in!");
      }
      catch (e) {
        this.access.disconnect();
        this.setStatus('disconnected');
        this.log("Failed connect:" + e);
      }
    }
 
  }

  RED.nodes.registerType('xmeye-config', XmeyeConfigNode, {
    credentials: {
      user: {type:'text'},
      password: {type: 'password'}
    }
  });
}
