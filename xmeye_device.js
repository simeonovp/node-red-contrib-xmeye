module.exports = function (RED) {
  'use strict'
  const path = require('path');
  const fs = require('fs');
  const ResponseCodes = require('./lib/ResponseCodes');
  const MessageIds = require('./lib/Messages');
  const FrameParser = require('./lib/FrameParser');
  const FrameAssembler = require('./lib/FrameAssembler');
  const FrameBuilder = require('./lib/FrameBuilder');
  const XmeyeInterpretter = require('xmeye-js-lib/Interpretter');

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

  const cfgGroups = {
    CONFIG_GET: 'Config',
    CHANNEL_ABILITY_GET: 'ChannelAbility',
    ABILITY_GET: 'Ability',
    SYSINFO_REQ: 'SysInfo',
    CONFIG_CHANNELTITLE_GET: 'Channel'
    //FULLAUTHORITYLIST_GET
    //USERS_GET
  };

  class XmeyeBase {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.deviceConfig = RED.nodes.getNode(config.deviceConfig);

      this.on('close', this.onClose.bind(this));

      if (this.deviceConfig) {
        // Start listening for xmeye config node status changes
        this.deviceConfig.addListener('xmeye_status', this.onStatus.bind(this));

        // Show the current xmeye config node status already
        this.onStatus(this.deviceConfig.xmeyeStatus);

        this.deviceConfig.initialize();
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
  }

  class XmeyeDeviceNode extends XmeyeBase {
    constructor(config) {
      super(config);

      this.action = config.action;

      this.on('input', this.onInput.bind(this));
    }

    onInput (msg, send, done) {
      msg.Action = this.action || msg.topic;
      if (!msg.Action) return done('When no action specified in the node, it should be specified in the msg.topic');
      if (typeof msg.Action != 'string') return done('msg.topic must be a string');
      const parts = msg.Action.split('/');
      if (parts.length > 1) msg.Action = parts[0];
      try {
        switch (msg.Action) {
        case 'options':
          if (parts.length < 2) throw 'Action ' + msg.topic + ' options group missing';
          switch(parts[1]) {
            case 'Command':
              msg.options = Object.keys(MessageIds);
              break;
            case 'CONFIG_GET':
              msg.options = configKeys;
              break;
            case 'CHANNEL_ABILITY_GET':
              msg.options = chAbilityKeys;
              break;
            default: 
              throw 'No options for group ' + parts[0] + ' specified';
            }
            this.send(msg);
          break;
        case 'config':
          if (this.deviceConfig) {
            msg.payload = this.deviceConfig.devConfig;
            this.send(msg);
          }
          break;
        default:
          return this.asyncAction(msg, parts).then(()=>done()).catch(err=>done(err));
        }
        done();
      }
      catch (exc) {
        done('Action ' + msg.topic + ' failed: ' + exc);
      }
    }

    asyncAction(msg, parts) {
      switch (msg.Action) {
      case 'send':
        if (parts.length < 2) throw 'Action ' + msg.topic + ' Command missing';
        msg.Command = parts[1];
        msg.MessageName = (parts.length > 2) ? parts[2] : null;
        msg.MessageData = (!msg.MessageName ? msg.payload : { [msg.MessageName]: msg.payload });
        return this.onSendMessage(msg);
      case 'connect': return this.deviceConfig.connect();
      case 'disconnect': return this.deviceConfig.disconnect();
      default: throw 'Action ' + msg.topic + ' is not supported';
      }
    }

    async onSendMessage(msg) {
      if (!msg) throw 'msg.payload not defined';

      const group = cfgGroups.hasOwnProperty(msg.Command) ? cfgGroups[msg.Command] : null;
      const resp = await this.deviceConfig.sendMessage(msg);
      if (resp) {
        if (group && (resp.Ret === 100)) {
          if (resp.data && resp.name) {
            this.deviceConfig.updateConfig(group, resp.name.replace(/(\[|\])/g, ''), resp.data);
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
  }

  class XmeyeLifeNode extends XmeyeBase {
    constructor(config) {
      super(config);

      this.streamClient;
      this.claimed = false;

      this.on('input', this.onInput.bind(this));
    }

    onClose(done) {
      this.cleanup();
      super.onClose(done);
    }

    onInput (msg, send, done) {
      if (!msg.Acion) return done('No action specified, it should be specified in the msg.Acion');
      if (typeof msg.Acion != 'string') return done('msg.Acion must be a string');
      try {
        this.asyncAction(msg).then(msg=>done(send(msg))).catch(err=>done('Action ' + msg.Acion + ' failed: ' + err));
      }
      catch (e) {
        this.cleanup();
      }
    }
  
    asyncAction(msg) {
      if (!msg.StreamType) msg.StreamType = 'Main'; // Substream to claim. Known to work are 'Main' and 'Extra1'
      if (!msg.Channel) msg.Channel = 0; // Videochannel to claim. Probably only useful for DVR's and not for IP Cams
      if (!msg.CombinMode) msg.CombinMode = 'CONNECT_ALL'; // Unknown. 'CONNECT_ALL' and 'NONE' work
      if (!msg.TransMode) msg.TransMode = 'TCP';

      switch (msg.Acion) {
      case 'Start': return this.startStream(msg);
      case 'Stop': return this.stopStream(msg);
      case 'Pause': return this.pauseStream(msg);
      default: throw 'Action ' + msg.topic + ' is not supported';
      }
    }

    cleanup() {
      this.claimed = false;
      const streamClient = this.streamClient;
      if (streamClient) setImmediate(streamClient.disconnect());
      this.streamClient = undefined;
    }

    // Grabs the video stream of the Device
    async startStream(msg) { // { StreamType, Channel, CombinMode, TransMode }) {
      if (this.streamClient) throw 'There already is an active Videostream instance. Please call stopVideoStream before requesting a new one with this DVRIPClient instance';

      const streamClient = this.deviceConfig.createConnection();
      if (!streamClient) throw ('Init failed');

      await streamClient.connect();
      await this.claimVideoStream(msg);

      this.streamClient = streamClient;
      this.streamClient.label = StreamType;

      this.streamClient.on('data:eof', this.onEndOfStream.bind(this));
      this.streamClient.on('data:video', this.onDataFrame.bind(this));
      this.streamClient.on('data:audio', this.onDataFrame.bind(this));
      this.streamClient.on('connection:lost', this.onConnectionClosed.bind(this));

      await controlStream(msg);
    }

    // Claim video stream on this connection, thus allowing the parent connection to start it
    async claimVideoStream({StreamType, Channel, CombinMode, TransMode}) {
      if (this.claimed) return;
      const res = await this.streamClient.sendMessage({
        Command: 'MONITOR_CLAIM',
        MessageName: 'OPMonitor',
        MessageData: {
          OPMonitor: {
            Action: 'Claim',
            Parameter: {Channel, CombinMode, StreamType, TransMode}
          }
        }
      });
      if (res.ErrorMessage) throw 'claimVideoStream failed err: ' + res.ErrorMessage;

      this.streamClient.setTimeout(15000);
      this.claimed = true;
    };

    onEndOfStream() {
      this.log('Receive eond of stream');
    }

    onConnectionClosed() {
      this.cleanup();
      this.error('connection lost');
    }

    onDataFrame(data) {
      this.send(data); 
    }

    // Ends active video stream. Options have to match the getVideoStream() call
    async stopStream(msg) {
      if (!this.streamClient) throw 'There no active Videostream instance';
      await controlStream(msg);
      this.cleanup();
    }

    async pauseStream(msg) {
      if (!this.streamClient) throw 'There no active Videostream instance';
      await controlStream(msg);
    }

    async controlStream({ Action, StreamType, Channel, CombinMode, TransMode }) {
      this.record.Action = action;
      const res = await this.deviceConfig.sendMessage({
        Command: 'MONITOR_REQ',
        MessageName: 'OPMonitor',
        MessageData: {
          OPMonitor: {
            Action,
            Parameter: { Channel, CombinMode, StreamType, TransMode } 
          }
        }
      });
      if (res.ErrorMessage) {
        this.log(action  + ' playback failed: ' + res.ErrorMessage);
        throw ('claimPlayback:' + res.ErrorMessage);
      }
    }
  }

  class XmeyePlaybackNode extends XmeyeBase {
    constructor(config) {
      super(config);

      this.streamClient = undefined;
      this.claimed = false;

      config.logDir = config.logDir || path.join('/data', 'logs', this.name);
      this.logDir = config.logDir;
      if (!fs.existsSync(config.logDir)) fs.mkdirSync(config.logDir, { recursive: true });

      this.on('input', this.onInput.bind(this));
    }

    onStatus(status) {
      super.onStatus(status);

      switch(status) {
        case 'disconnected':
          this.deinit();
          break;
      }
    }

    onClose(done) {
      this.cleanup();
      super.onClose(done);
    }

    onInput (msg, send, done) {
      msg.Action = msg.topic /*|| this.config.action*/;
      if (!msg.Action) return done('When no action specified in the node, it should be specified in the msg.topic');
      if (typeof msg.Action != 'string') return done('msg.topic must be a string');
      return this.asyncAction(msg).then(msg=>done(send(msg))).catch(err=>done('Action ' + msg.topic + ' failed: ' + err));
    }
  
    asyncAction(msg) {
      switch (msg.Action) {
      case 'playback': return this.onPlayback(msg);
      case 'download': return this.onDownload(msg);
      case 'downloadExisting': return this.onDownload(msg);
      case 'playCache': // TODO
      case 'playDevice': // TODO
      case 'deleteCache': // TODO
      case 'deleteDevice': // TODO
      default: throw 'Action ' + msg.topic + ' is not supported';
      }
    }

    async init() {
      if (this.streamClient) return;
      const streamClient = this.deviceConfig.createConnection();
      if (!streamClient) throw ('Init failed');

      await streamClient.connect();
      this.connected = true;

      this.deviceConfig.connection.label = 'Control';

      this.streamClient = streamClient;
      this.streamClient.label = 'Playback';
      this.streamClient.on('data:eof', this.onDownloadReady.bind(this));
      this.streamClient.on('data:video', this.onDataFrame.bind(this));
      this.streamClient.on('data:audio', this.onDataFrame.bind(this));
      this.streamClient.on('connection:lost', this.onConnectionClosed.bind(this));

      this.log('Init success');
    }

    deinit() {
      this.claimed = false;
      if (!this.streamClient) return;

      this.streamClient.off('data:eof', this.onDownloadReady.bind(this));
      this.streamClient.off('data:video', this.onDataFrame.bind(this));
      this.streamClient.off('data:audio', this.onDataFrame.bind(this));
      this.streamClient.off('connection:lost', this.onConnectionClosed.bind(this));

      if (this.connected) {
        this.connected = false;
        
        this.streamClient.disconnect().then(()=>{ this.streamClient = null; });
      }
      else this.streamClient = undefined;
    }

    async onPlayback(msg) {
      // play sd record
      const record = this.getRecordFromFilename(msg.payload);
      if (!record) return Promise.reject('can not get record from filename ' + msg.payload);

      const streamClient = this.streamClient;
      streamClient.on('connection:lost', () => {
        this.log('Record downloaded ' + recPath);
      });

      try {
        // this.log('Try get stream!');
        await this.reqPlayback(streamClient, record); //<-- ??? reqPlayback supports only one parameter
        streamClient.onVideoFrame = (data)=>{ 
          msg.payload = data;
          this.send(msg); 
        };
        this.log('Got stream!');
        // this.log('Got stream!');
      }
      catch (e) {
        streamClient.disconnect();
        return Promise.reject('Playback reqPlayback filed:' + e);
      }
      return Promise.resolve(msg);
    }

    getFfmpegCommand(filename) {
      //spawn
      return `ffmpeg -loglevel quiet -i ${filename} -c copy  -f mp4 -movflags +frag_keyframe+empty_moov+default_base_moof pipe:1`;
    }

    cleanup(disconnect = true) {
      if (disconnect) this.deinit();
      if (this.fd) {
        fs.closeSync(this.fd);
        this.fd = null;
      }
      if (this.started) {
        this.started = false;
        try {
          this.controlPlayback('Stop');
        }
        catch (e) {
          this.log('Cleanup failed:' + e);
        }
        this.record = null;
      }
    }

    onDownloadReady() {
      this.cleanup(false);
      this.log(`Record downloaded (${this.download.recSize}bytes) to ${this.download.recPath}`);
      this.download.recSize = this.download.downloaded;
      this.send({ payload: this.download, filename: this.download.recPath, ready: true });
    }

    onConnectionClosed() {
      this.cleanup();
      this.error('connection lost');
    }

    onDataFrame(data) {
      if (!this.fd) return;
      //-- this.download.recSize += data.length;
      this.download.downloaded += data.length;
      fs.writeSync(this.fd, data);
      this.send({ payload: this.download, filename: this.download.recPath, ready: false });
    }

    async onDownload(msg) {
      if (!msg.payload) throw ('msg.payload is emply, must contain filename');

      if (this.started) throw ('Playback already running'); //TODO restart

      const filename = (typeof msg.payload === 'string') ? msg.payload : msg.payload.FileName;
      const recSize = (typeof msg.payload === 'string') ? 0 : parseInt(msg.payload.FileLength);
      const record = this.getRecordFromFilename(filename);
      if (!record) throw ('can not get record from filename ' + msg.payload);

      const recPath = msg.filename || this.getRecordPathFromFilename(record.FileName);
      //TODO return if file exists

      this.fd = recPath ? fs.openSync(recPath, 'w', 0o666) : null;
      if (!this.fd) throw ('openSync Failed, fd:' + this.fd + ', ' + recPath);
      
      this.download = { recPath, recSize, downloaded : 0 }; 
  
      try {
        await this.init();
      }
      catch(e) {
        cleanup(false);
        throw ('createConnection for download fialed');
      }

      await this.reqPlayback(record);
    }

    async reqPlayback(query) {
      const file = query.FileName;
      const start = query.BeginTime;
      const end = query.EndTime;
      this.log(`Request playback ${file} (${start})-(${end})`);
  
      await this.init();
      
      this.record = {
        Action : '',
        EndTime : end,
        Parameter : {
          FileName: file,
          IntelligentPlayBackEvent: '',
          IntelligentPlayBackSpeed: 0,
          PlayMode: 'ByName',
          StreamType: 0,
          TransMode: 'TCP',
          Value: 0
        },
        StartTime : start
      };
      await this.claimPlayback();
      await this.controlPlayback('Start');
      this.started = true;
    }

    async claimPlayback() {
      if (this.claimed) return;

      this.record.Action = 'Claim';
      const msg = {
        Command: 'PLAY_CLAIM',
        MessageName: 'OPPlayBack',
        MessageData: { OPPlayBack: this.record }
      }
      const res = await this.streamClient.sendMessage(msg);
      if (res.ErrorMessage) {
        this.log('Claim playback failed: ' + res.ErrorMessage);
        throw ('claimPlayback:' + res.ErrorMessage);
      }

      this.streamClient.setTimeout(15000);
      this.claimed = true;
    }

    async controlPlayback(action) {
      this.record.Action = action;
      const msg = {
        Command: 'PLAY_REQ',
        MessageName: 'OPPlayBack',
        MessageData: { OPPlayBack: this.record }
      }
      const res = await this.deviceConfig.sendMessage(msg);
      if (res.ErrorMessage) {
        this.log(action  + ' playback failed: ' + res.ErrorMessage);
        throw ('claimPlayback:' + res.ErrorMessage);
      }
    }

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

      const dir = path.join(this.logDir, data.Year, data.Year + data.Month);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      return path.join(dir, `${data.Year + data.Month + data.Day}_${data.BeginTime}_${data.EndTime}.h264`);
    }

    getRecordFromFilename(filename) {
      //filename = '/idea0/2021-11-12/001/21.00.40-21.00.49[M][@54ff][0].h264';
      const re = /\/.*\/([0-9\-]+)\/.*\/([0-9.]+)-([0-9.]+).*/g;
      const parts = re.exec(filename);
      if (!parts || parts.length !== 4) return null
      return {
        FileName: filename,
        Date: parts[1],
        BeginTime: `${parts[1]} ${parts[2]}`,
        EndTime: `${parts[1]} ${parts[3]}`
      };
    }
  }

  class XmeyeFrameParserNode {
    constructor(config) {
      RED.nodes.createNode(this, config);

      //this._deviceConfig = RED.nodes.getNode(config.deviceConfig);

      this._commandParser = new FrameParser();
      this._commandParser.onResponse = this.onResponse.bind(this);
      this._commandParser.onMediaFrame = this.onMediaFrame.bind(this);
  
      this._receiver = new FrameAssembler(this._commandParser);
  
      this.on('input', this.onInput.bind(this));
      this.on('close', this.onClose.bind(this));
    }

    onInput (msg, send, done) {
      try {
        this._receiver.applyData(msg);
        done();
      }
      catch (exc) {
        done('Action ' + msg.topic + ' failed: ' + exc);
      }
    }

    onClose(done) {
      done();
    }

    onResponse(frame) {
      this.send(frame);
    }
    
    onMediaFrame(frame) {
    }    
  }

  class XmeyeFrameBuilderNode {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.deviceConfig = RED.nodes.getNode(config.deviceConfig);

      this.on('input', this.onInput.bind(this));
      this.on('close', this.onClose.bind(this));
    }

    onInput (msg, send, done) {
      try {
        if (!msg.SessionId) return done('msg.SessionId not defined');
        if (!msg.SequenceID) return done('msg.SequenceID not defined');
        send(FrameBuilder.buildMessage(msg, this.SessionId.buffer, this._cmdSeq++));
        done();
      }
      catch (exc) {
        done('Action ' + msg.topic + ' failed: ' + exc);
      }
    }

    onClose(done) {
      done();
    }
  }

  class XmeyePcapReader {
    constructor(config) {
      RED.nodes.createNode(this, config);

      this.config = config; //TODO convert to Buffer
      this.on('input', this.onInput.bind(this));
    }
   
    onInput (msg, send, done) {
      let interpretter = new XmeyeInterpretter();
      interpretter.onRequest = (frame => {
        //console.log(`XmeyeRequest: ${JSON.stringify(frame, null, 2)}`);
        send({ payload: { XmeyeRequest: frame } });
      });
      interpretter.onResponse = (frame => {
        //console.log(`XmeyeResponse: ${JSON.stringify(frame, null, 2)}`);
        send({ payload: { XmeyeResponse: frame } });
      });
      interpretter.parse(msg.payload, this.config);
    }
  }

  RED.nodes.registerType('xmeye-device', XmeyeDeviceNode);
  RED.nodes.registerType('xmeye-life', XmeyeLifeNode);
  RED.nodes.registerType('xmeye-playback', XmeyePlaybackNode);
  RED.nodes.registerType('xmeye-frame-parser', XmeyeFrameParserNode);
  RED.nodes.registerType('xmeye-frame-builder', XmeyeFrameBuilderNode);
  RED.nodes.registerType('xmeye-pcap-reader', XmeyePcapReader);
}
