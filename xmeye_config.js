module.exports = function (RED) {
  'use strict'
  const ResponseCodes = require('./lib/ResponseCodes');
  const Connection = require('./lib/Connection');
  const fs = require('fs');
  const path = require('path');
  const { createHash } = require('crypto');
  const objectPath = require('object-path');

  class XmeyeConfigNode {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.ip = config.ip;
      this.port = parseInt(config.port || 34567);
      this.user = config.user || this.credentials.user;
      this.password = config.password || this.credentials.password;
      this.useHash = true;
      this.timeout = parseInt(config.timeout || 5000);
      this.configDir = config.configDir || '';
      this.name = config.name;
      
      this.setMaxListeners(0); // by default only 10 listeners are allowed

      this.on('close', this.onClose.bind(this));

      if (this.configDir && !fs.existsSync(config.configDir)) fs.mkdirSync(config.configDir, { recursive: true });
      this.cfgPath = this.configDir ? path.join(this.configDir, (this.name || 'noname') + '.json') : '';
      this.devConfig = {};
      this.connection;
      this.accessSettings = { camIp: this.ip, camMediaPort: this.port, commandTimeoutMs: this.timeout };
    }

    initialize() {
      if (this.connection) return;

      if (!this.ip) {
        this.error( "Cannot connect due to IP of the Xmeye device not configured", {} );
           
        this.setStatus('unconfigured');
        return;
      }

      this.loadConfig();

      this.setStatus('initializing');
      this.connection = new Connection(this.accessSettings);
    
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
      if (this.connection) this.connection.disconnect();
      this.setStatus('');
      this.removeAllListeners('xmeye_status');
      if (done) done();
    }

    setStatus(status) {
      this.xmeyeStatus = status;
      // Pass the new status to all listeners
      this.emit('xmeye_status', status);
    }

    get sessionId() { return this.connection ? this.connection.sessionId : null; }

    async connect() {
      if (!this.connection) {
        this.error('cam connection object missing (0) for ' + this.name);
        return;
      }
    
      try {
        await this.connection.connect();
        this.setStatus('login');
        this.log("Connected!");
    
        await this.login();
        this.setStatus('connected');
        this.log("Logged in!");
      }
      catch (e) {
        this.disconnect().catch(e=>{this.log("Failed connect (1):" + e);});
        this.log("Failed connect (2):" + e);
      }
    }
    
    disconnect() {
      if (!this.connection) {
        this.error('cam connection object missing (0) for ' + this.name);
        return Promise.resolve();
      }
      this.setStatus('disconnected');
      return this.connection.disconnect();
    }

    //TODO (currently not used)
    async login() {
      if (this.connection.isLoggedIn) throw 'Already logged in';

      this.connection.resetSeqCounter();

      //Absolutely stupid custom password 'hashing'. Special thanks to https://github.com/tothi/pwn-hisilicon-dvr#password-hash-function
      //There isnt really any protection involved with this... An attacker can just as well sniff the hash and use that to authenticate.
      //By checking out the Github link you should come to the conclusion that any device of this kind should *never* be directly
      //exposed to the internet anways.
      let PassWord = this.password;
      if (this.useHash) {
        const pw_md5 = createHash('md5').update(PassWord).digest();
        let HashBuilder = '';

        for (let i = 0; i < 8; i++) {
          let n = (pw_md5[2 * i] + pw_md5[2 * i + 1]) % 62;
          if (n > 9) n += (n > 35) ? 13 : 7;
          HashBuilder += String.fromCharCode(n + 48);
        }

        PassWord = HashBuilder;
      }

      const Response = await this.connection.sendMessage({
        Command: 'LOGIN_REQ2',
        MessageData: {
          EncryptType: this.useHash ? 'MD5' : 'NONE',
          LoginType: 'DVRIP-Node',
          UserName: this.user,
          PassWord
        }
      });

      if (!Response.Ret || (Response.Ret !== 100)) throw `Login response returns (${Response.Ret} ${ResponseCodes.ErrorCodes[Response.Ret] || 'Unknown error'})!`;

      if (!Response.SessionID || !Response.SessionID.length) throw 'Login response did not contain a Session Id with a known field!';

      const sessionID = parseInt(Response.SessionID.toString());
      if (!sessionID) throw 'Login response contain a Session Id ' + Response.SessionID;

      this.connection.setSessionId(Response.SessionID);

      if (Response.data.AliveInterval) this.setupAliveKeeper(Response.data.AliveInterval);
    }

    sendMessage(msg) {
      if (this.connection) return this.connection.sendMessage(msg); // : Promise.resolve();
      throw 'cam connection object missing for ' + this.host;
    }

    setupAliveKeeper(interval) {
      this.connection.setupAliveKeeper({
        MessageName: 'KeepAlive',
        Command: 'KEEPALIVE_REQ',
        IgnoreResponse: true
      }, interval);
    }

    createConnection() {
      return this.connection ? this.connection.clone() : null;
    }
  }

  RED.nodes.registerType('xmeye-config', XmeyeConfigNode, {
    credentials: {
      user: {type:'text'},
      password: {type: 'password'}
    }
  });
}
