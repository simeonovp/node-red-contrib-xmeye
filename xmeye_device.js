module.exports = function (RED) {
  'use strict'
  //sip?? let settings = RED.settings;
  //sip?? const utils = require('./utils');

  class XmeyeDeviceNode {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.deviceConfig = RED.nodes.getNode(config.deviceConfig);
      this.action = config.action;

      this.on('input', this.onInput.bind(this));
      this.on('close', this.onClose.bind(this));

      if (this.deviceConfig) {
        // Start listening for xmeye config node status changes
        this.deviceConfig.addListener('xmeye_status', this.onStatus.bind(this));

        // Show the current xmeye config node status already
        this.onStatus(this.deviceConfig.xmeyeStatus);

        this.deviceConfig.initialize();
      }
    }

    onInput (msg, send, done) {
      this.log('--- enter XmeyeDeviceNode onInput');
      msg.topic = this.action || msg.topic; //TODO remove previous line

      if (!msg.topic) {
        this.log('--- msg: ' + JSON.stringify(msg));
        this.warn('When no action specified in the node, it should be specified in the msg.topic');
        return;
      }

      try {
        switch (msg.topic) {
          case 'sendMessage':
            this.sendMessage(msg, done);
            return;
          case 'OPFileQuery':
            this.queryFiles(msg, done);
            return;
          case 'playback':
            this.reqPlayback(msg, done);
            return;
          default:
            if (done) done('Action ' + msg.topic + ' is not supported');                    
            else this.error('Action ' + msg.topic + ' is not supported');                    
            return;
        }
      }
      catch (exc) {
        if (done) done('Action ' + msg.topic + ' failed: ' + exc);
        else this.error('Action ' + msg.topic + ' failed: ' + exc);
        return;
      }
    }

    onClose(done) {
      this.log('--- enter XmeyeDeviceNode onClose');
      if (this.listener) {
        this.deviceConfig.removeListener('xmeye_status', this.onStatus);
      }
      if (done) done();
    }

    onStatus(status) {
      this.log('--- enter XmeyeDeviceNode onStatus ' + status);
      switch(status) {
        case 'unconfigured':
          this.status({ fill: 'red', shape: 'ring', text: status});
          break;
        case 'initializing':
        case 'login':
          this.status({ fill: 'yellow', shape: 'dot', text: status});
          break;
        case 'connected':
          this.status({fill: 'green', shape: 'dot', text: status}); 
          break;
        case 'disconnected':
          this.status({ fill: 'red', shape: 'ring', text: status});
          break;
        case '':
          this.status({});
          break;
        default:
          this.status({fill: 'red', shape: 'ring', text: 'unknown'});
      }
    }

    done(cb, msg = '') {
      if (msg) {
        if (cb) cb(msg);
        else this.error('queryFiles failed:', e);
      }
      else {
        if (cb) cb();
      }
    }

    async sendMessage(msg, done) {
      try {
        if (!msg.payload) {
          if (done) done('msg.payload not defined');
          else this.error('msg.payload not defined');
          return;
        }
        const resp = await this.deviceConfig.access.sendMessage(msg.payload);
        if (resp) {
          this.send({topic: msg.payload.MessageName, payload: resp});
        }
        this.done(done);
      }
      catch (e) {
        this.done(done, 'sendMessage failed:' + e);
      }
    }

    async queryFiles(msg, done) {
      try {
        const resp = await this.deviceConfig.access.executeHelper('FILESEARCH_REQ', 'OPFileQuery', {
          BeginTime: msg.begin,
          Channel: 0,
          DriverTypeMask: '0x0000FFFF',
          EndTime: msg.end,
          Event: '*',
          StreamType: '0x00000000',
          Type: 'h264'
        });
    
        if (resp && resp.data) {
          //input in dataParser:
          // { 
          //   "Name" : "OPFileQuery",
          //   "OPFileQuery" : [ 
          //     {
          //       "BeginTime" : "2021-11-11 17:29:53", 
          //       "DiskNo" : 0, 
          //       "EndTime" : "2021-11-11 17:29:57", 
          //       "FileLength" : "0x00000307", 
          //       "FileName" : "\/idea0\/2021-11-11\/001\/17.29.53-17.29.57[M][@53bd][0].h264", 
          //       "SerialNo" : 0 
          //     }
          //   ],
          //   "Ret" : 100, 
          //   "SessionID" : "0x00000002" 
          // }
          this.send({topic: msg.topic, payload: resp.data});

          this.log('Record count ' + resp.data.length);
          resp.data.forEach(rec => {
            // const FileName = rec.FileName;
            // const BeginTime = new Date(Date.parse(rec.BeginTime));
            // const EndTime = new Date(Date.parse(rec.EndTime));
            // const FileLength = parseInt(rec.FileLength);
          });
        }
        else {
        }
        if (done) done();
      }
      catch (e) {
        this.done(done, 'queryFiles failed:' + e);
      }
    }

    async reqPlayback(msg, done) {
      // play sd record
      if (!this.deviceConfig.access) {
        this.done(done, 'cam access object missing for ' + this.deviceConfig.host);
        return; //TODO throw
      }
      const record = msg.payload || {
        FileName: '',
        BeginTime: '',
        EndTime: ''
      };

      try {
        this.deviceConfig.access.on('videostream:lost', ()=>{
          this.log('Cam videostream:lost');
          this.deviceConfig.access.disconnectMedia();
        });
    
        this.log('Try get stream!');
        let { video, audio } = await this.deviceConfig.access.reqPlayback(record);
        this.log('Got stream!');
      }
      catch (e) {
        this.done(done, 'Failed (2):' + e);
        this.deviceConfig.access.disconnectMedia();
      }
      if (done) done();
    }

  }

  RED.nodes.registerType('xmeye-device', XmeyeDeviceNode);
}
