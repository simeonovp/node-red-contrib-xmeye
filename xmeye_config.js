module.exports = function (RED) {
  'use strict'
  //?? const settings = RED.settings;
  const xmeyecam = require('./lib/dvripclient');
  const fs = require('fs');
  const path = require('path');
  const objectPath = require('object-path');

  class XmeyeConfigNode {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.ip = config.ip;
      this.port = parseInt(config.port || 34567);
      this.user = config.user || this.credentials.user;
      this.password = config.password || this.credentials.password;
      this.timeout = parseInt(config.timeout || 5000);
      this.configDir = config.configDir || '';
      this.name = config.name;
      
      this.setMaxListeners(0); // by default only 10 listeners are allowed

      this.on('close', this.onClose.bind(this));

      this.cfgPath = this.configDir ? path.join(this.configDir, (this.name || 'noname') + '.json') : '';
      this.devConfig = {};
      this.access = null;
      this.accessSettings = { camIp: this.ip, camMediaPort: this.port, commandTimeoutMs: this.timeout };
    }

    initialize() {
      if (this.access) return;

      if (!this.ip) {
        this.error( "Cannot connect due to IP of the Xmeye device not configured", {} );
           
        this.access = null;
        this.setStatus('unconfigured');
        return;
      }

      this.loadConfig();

      this.setStatus('initializing');
      this.access = new xmeyecam(this.accessSettings);
    
      this.connect();
    }

    loadConfig() {
      if (!this.cfgPath || !fs.existsSync(this.cfgPath)) return;
      return JSON.parse(fs.readFileSync(this.cfgPath, 'utf8'));
    }

    saveConfig() {
      if (!this.cfgPath) return;
      fs.createWriteStream(this.cfgPath).write(JSON.stringify(this.devConfig, null, 2));
    }

    updateConfig(group, name, value) {
      if (!this.devConfig[group]) this.devConfig[group] = {};
      objectPath.set(this.devConfig[group], name.replace(/(\[|\])/g, ''), value);
    }

    onClose(done) {
      if (this.access) this.access.disconnect();
      this.setStatus(this, '');
      this.removeAllListeners('xmeye_status');
      if (done) done();
    }

    setStatus(status) {
      this.xmeyeStatus = status;
      // Pass the new status to all listeners
      this.emit('xmeye_status', status);
    }

    async connect() {
      if (!this.access) {
        this.error('cam access object missing (0) for ' + this.name);
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
