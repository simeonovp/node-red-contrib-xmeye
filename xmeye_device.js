module.exports = function (RED) {
  'use strict'
  const path = require('path');
  const fs = require('fs');
  const StreamClient = require('./lib/dvripstreamclient.js');
  const ResponseCodes = require('./lib/ResponseCodes');

  const configKeys = [
    'System.ExUserMap',
    'System.TimeZone',
    'NetWork.DigManagerShow', //607, 'Configuration does not exist'
    'NetWork.NetCommon',
    'NetWork.NetNTP',
    'NetWork.NetDHCP',
    'NetWork.OnvifPwdCheckout',
    'Ability.SerialNo',
    'Ability.VoiceTipType',
    'Status.NatInfo',
    'General.General',
    'General.Location',
    'General.AutoMaintain',
    'General.OnlineUpgrade',
    'AVEnc.EncodeStaticParam',
    'AVEnc.SmartH264V2.[0]',
    'AVEnc.SmartH264',
    'AVEnc.VideoWidget',
    'OEMcfg.Correspondent',
    'fVideo.GUISet',
    'Uart.PTZ',
    'Uart.RS485',
    'Uart.Comm',
    'Camera.ClearFog',
    'Camera.Param.[0]',
    'Camera.ParamEx.[0]',
    'Detect.MotionDetect.[0]',
    'Detect.HumanDetection.[0]',
    'Detect.BlindDetect.[0]',
    'Detect.LossDetect.[0]',
    'Alarm.LocalAlarm.[0]',
    'Alarm.AlarmOut',
    'Storage.StorageNotExist',
    'Storage.StoragePosition',
    'Record.[0]',
    'Storage.Snapshot.[0]',
    'Simplify.Encode'
  ];

  const chAbilityKeys = [
    'SystemFunction',
    'Camera',
    'SupportExtRecord',
    'MultiLanguage',
    'MultiVstd',
    'VencMaxFps',
    'EncodeCapability',
    'Encode264ability',
    'AHDEncodeL',
    'NetOrder',
    'BlindCapability',
    'PTZProtocol',
    'UartProtocol',
    'ComProtocol',
    'MotionArea',
    'HumanRuleLimit',
    'MaxPreRecord'
  ];

  class XmeyeDeviceNode {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.deviceConfig = RED.nodes.getNode(config.deviceConfig);
      this.action = config.action;
      config.logDir = config.logDir || path.join('/data', 'logs', this.name);
      this.logDir = config.logDir;
      if (!fs.existsSync(config.logDir)) fs.mkdirSync(config.logDir, { recursive: true });

      config.configDir = config.configDir || path.join('cams', 'configs');
      if (!fs.existsSync(config.configDir)) fs.mkdirSync(config.configDir, { recursive: true });

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
      msg.topic = this.action || msg.topic;
      if (!msg.topic) done('When no action specified in the node, it should be specified in the msg.topic');
      try {
        switch (msg.topic) {
        case 'listOptions':
          switch(msg.payload) {
          case 'getConfig':
            msg.topic = 'listConfigs';
            msg.payload = configKeys;
            break;
          case 'getChAbility':
            msg.topic = 'listChAbilities';
            msg.payload = chAbilityKeys;
            break;
          default: 
            throw 'No options class specified, it should be specified in the msg.payload';
          }
          this.send(msg);
          break;
        case 'listConfigs':
          msg.payload = configKeys;
          this.send(msg);
          break;
        case 'listChAbilities':
          msg.payload = chAbilityKeys;
          this.send(msg);
          break;
        case 'devConfig':
          if (this.deviceConfig) {
            msg.payload = this.deviceConfig.devConfig;
            this.send(msg);
          }
          break;
        default:
          return this.asyncAction(msg).then(()=>done()).catch(err=>done(err));
        }
        done();
      }
      catch (exc) {
        done('Action ' + msg.topic + ' failed: ' + exc);
      }
    }

    onClose(done) {
      this.deviceConfig.removeListener('xmeye_status', this.onStatus.bind(this));
      done();
    }

    onStatus(status) {
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

    asyncAction(msg) {
      switch (msg.topic) {
      case 'sendMessage': return this.onSendMessage(msg.payload);
      case 'getConfig': return this.sendCommand('CONFIG_GET', msg.payload, null, 'Config');
      case 'getChAbility': return this.sendCommand('CHANNEL_ABILITY_GET', msg.payload, null, 'ChannelAbility');
      case 'setConfig': return this.sendCommand('CONFIG_SET', msg.payload); //TODO
      case 'playback': return this.onPlayback(msg);
      case 'download': return this.onDownload(msg);
      case 'opFileQuery': return this.executeHelper('FILESEARCH_REQ', 'OPFileQuery', msg.payload);
      case 'setBrowserLanguage': return this.sendCommand('CONFIG_SET', 'BrowserLanguage', { BrowserLanguageType: msg.payload });

      case 'getSystemTime': return this.sendCommand('TIMEQUERY_REQ', 'OPTimeQuery');
      case 'getSystemFunction': return this.sendCommand('ABILITY_GET', 'SystemFunction', null, 'Ability'); //?
      case 'getSystemInfo': return this.sendCommand('SYSINFO_REQ', 'SystemInfo', null, 'SysInfo');
      case 'getStorageInfo': return this.sendCommand('SYSINFO_REQ', 'StorageInfo', null, 'SysInfo');
      case 'getChannelTitle': return this.sendCommand('CONFIG_CHANNELTITLE_GET', 'ChannelTitle');
      case 'getOPVersionList': return this.sendCommand('UPDATE_REQ', 'OPVersionList');
      case 'getAuthorityList': return this.sendCommand('FULLAUTHORITYLIST_GET');
      case 'getAuthorityGroups': return this.sendCommand('GROUPS_GET');
      case 'getUsers': return this.sendCommand('USERS_GET');
      case 'clearLogs': return this.executeHelper('SYSMANAGER_REQ', 'OPLogManager', { Action: 'RemoveAll' });
      case 'rebootDevice': return this.executeHelper('SYSMANAGER_REQ', 'OPMachine', { Action: 'Reboot' });
      case 'opLogsQuery': return this.executeHelper('LOGSEARCH_REQ', 'OPLogQuery', msg.payload);
      default:
        throw 'Action ' + msg.topic + ' is not supported';
      }
    }

    async onSendMessage(msg, Group) {
      if (!msg) throw 'msg.payload not defined';
      if (!this.deviceConfig.access) throw 'cam access object missing (1) for ' + this.deviceConfig.host;

      const resp = await this.deviceConfig.access.sendMessage(msg);
      if (resp) {
        if (Group && (resp.Ret === 100)) {
          if (resp.data && resp.name) {
            this.deviceConfig.updateConfig(Group, resp.name.replace(/(\[|\])/g, ''), resp.data);
            this.deviceConfig.saveConfig();
          }
          else {
            this.error('onSendMessage invalid response: ' + JSON.stringify(resp));
          }
        }

        msg.payload = resp;
        this.send(msg);
      }
    }

    /**
     * Claim video stream on this connection, thus allowing the parent connection to start it
     *
     * @param {Object} streamInfo
     * @param {string} [streamInfo.StreamType='Main'] Substream to claim. Known to work are 'Main' and 'Extra1'
     * @param {string} [streamInfo.Channel=0] Videochannel to claim. Probably only useful for DVR's and not for IP Cams
     * @param {string} [streamInfo.CombinMode='CONNECT_ALL'] Unknown. 'CONNECT_ALL' and 'NONE' work
     * @returns {Promise} Promise resolves with {@link DVRIPCommandResponse} of called underlying command
     */
    async claimVideoStream(streamClient, {StreamType = 'Main', Channel = 0, CombinMode = 'CONNECT_ALL'}) {
      const OPMonitor = {
        Action: 'Claim',
        Parameter: {Channel, CombinMode, StreamType, TransMode: 'TCP'}
      };
      const res = await streamClient.executeHelper('MONITOR_CLAIM', 'OPMonitor', OPMonitor);
      if (res.ErrorMessage) throw 'claimVideoStream failed err: ' + res.ErrorMessage;

      streamClient.SocketTimeout = 5000;
      streamClient.claimed = true;
    }
    
    async claimPlayback(streamClient, parameter, start, end) {
      const OPPlayBack = {
        Action : 'Claim',
        EndTime : end,
        Parameter : parameter,
        StartTime : start
      };
  
      let res = await streamClient.executeHelper('PLAY_CLAIM', 'OPPlayBack', OPPlayBack);
      // {"Ret":100,"SessionID":"0x000000a1","name":"OPPlayBack"}
      if (res.ErrorMessage) throw 'claimPlayback failed err: ' + res.ErrorMessage;

      streamClient.SocketTimeout = 15000;
      streamClient.claimed = true;
    }
  
    async onPlayback(msg) {
      // play sd record
      if (!this.deviceConfig.access) {
        throw 'cam access object missing (2) for ' + this.deviceConfig.host;
      }

      const record = this.getRecordFromFilename(msg.payload);
      if (!record) throw 'can not get record from filename ' + msg.payload;

      const streamClient = new StreamClient(this.deviceConfig.accessSettings);
      streamClient._type = 'DVRIPStreamClient'; //---
      streamClient.on('connection:lost', () => {
        this.log('Record downloaded ' + recPath);
        try {
        }
        catch (e) {} //???
        this.send([msg]);
      });

      try {
        // this.log('Try get stream!');
        await this.reqPlayback(streamClient, record);
        streamClient.onVideoFrame = (data)=>{ this.send([null, {payload: data}]); };
        this.log('Got stream!');
        // this.log('Got stream!');
      }
      catch (e) {
        streamClient.disconnect();
        throw 'Playback reqPlayback filed:' + e;
      }
    }

    async onDownload(msg) {
      if (!this.deviceConfig.access) {
        throw 'cam access object missing (4) for ' + this.deviceConfig.host;
      }

      if (!msg.payload) throw 'msg.payload is emply, must contain filename';

      const record = this.getRecordFromFilename(msg.payload);
      if (!record) throw 'can not get record from filename ' + msg.payload;

      const recPath = this.getRecordPathFromFilename(record.FileName);
      const fd = recPath ? fs.openSync(recPath, 'w', 0o666) : null;
      if (!fd) throw 'openSync Failed, fd:' + fd + ', ' + recPath;
      
      const streamClient = new StreamClient(this.deviceConfig.accessSettings);
      streamClient._type = 'DVRIPStreamClient'; //---
      streamClient.on('connection:lost', () => {
        this.log('Record downloaded ' + recPath);
        try {
          fs.closeSync(fd);
        }
        catch (e) {} //???
        this.send([msg]); //???
      });

      try {
        // this.log('Try get stream!');
        await this.reqPlayback(streamClient, record);
        streamClient.onVideoFrame = (data)=>{ fs.writeSync(fd, data); };
        // this.log('Got stream!');
      }
      catch (e) {
        streamClient.disconnect();
        fs.closeSync(fd);
        throw 'Download reqPlayback failed:' + e;
      }
    }

    async reqPlayback(streamClient, query) {
      const file = query.FileName;
      const start = query.BeginTime;
      const end = query.EndTime;
      this.log(`Request playback ${file} (${start})-(${end})`);
  
      streamClient.reuseSession(this.deviceConfig.access.SessionId);

      try {
        await streamClient.connect();
        const parameter = {
          FileName: file,
          IntelligentPlayBackEvent: '',
          IntelligentPlayBackSpeed: 0,
          PlayMode: 'ByName',
          StreamType: 0,
          TransMode: 'TCP',
          Value: 0
        };
        
        await this.claimPlayback(streamClient, parameter, start, end);

        await this.executeHelper('PLAY_REQ', 'OPPlayBack', {
          EndTime: end,
          Action: 'Start',
          Parameter: parameter,
          StartTime: start
        });
        //this.log('-- playback started');
      } 
      catch (err) {
        throw err;
      }
    }

    //helpers
    getRecordPathFromFilename(filename) {
      // '/idea0/2021-11-12/001/21.00.40-21.00.49[M][@54ff][0].h264';
      const re = /\/.*\/([0-9]+)-([0-9]+)-([0-9]+)\/.*\/([0-9.]+)-([0-9.]+).*/g;
      const parts = re.exec(filename);
      if (!parts || parts.length !== 6) return null
      const data = {
        Year: parts[1],
        Month: parts[2],
        Day: parts[3],
        BeginTime: parts[4].split('.').join(''),
        EndTime: parts[5].split('.').join('')
      };

      //--
      // const dir = path.join(this.logDir, data.Year, data.Year + data.Month, data.Year + data.Month + data.Day);
      // if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // return path.join(dir, `${data.BeginTime}_${data.EndTime}.h264`);

      const dir = path.join(this.logDir, data.Year, data.Year + data.Month);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return path.join(dir, `${data.Year + data.Month + data.Day}_${data.BeginTime}_${data.EndTime}.h264`);
    }

    getRecordFromFilename(filename) {
      //filename = '/idea0/2021-11-12/001/21.00.40-21.00.49[M][@54ff][0].h264';
      const re = /\/.*\/([0-9\-]+)\/.*\/([0-9.]+)-([0-9.]+).*/g;
      const parts = re.exec(filename);
      if (!parts || parts.length !== 4) return null
      const record = {
        FileName: filename,
        Date: parts[1],
        BeginTime: `${parts[1]} ${parts[2]}`,
        EndTime: `${parts[1]} ${parts[3]}`
      };
      return record;
    }

    sendCommand(Command, MessageName, MessageData, Group) {
      return this.onSendMessage({ Command, MessageName, MessageData}, Group);
    }

    executeHelper(Command, MessageName, MessageData) {
      //Some messages (E.g.) the LOGIN_REQ2 do not actually have a MessageName...
      //thus we obviously cannot wrap the data of those like we have to with other messages
      MessageData = (!MessageName ? MessageData : { [MessageName]: MessageData });
      return this.sendCommand(Command, MessageName, MessageData);
    }
  }

  RED.nodes.registerType('xmeye-device', XmeyeDeviceNode);
}
