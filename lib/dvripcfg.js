const defDevCfg = {
  SystemFunction: {},
  SystemInfo: {},
  StorageInfo: [],
  NetWork: { 
    DigManagerShow: null,
    OnlineUpgrade: {},
    NetNTP: {},
    NetCommon: {},
    NetDHCP: [],
    OnvifPwdCheckout: {}
  },
  Camera: {
    ClearFog: [],
    Param: [ {} ],
    ParamEx: [ {} ]
  },
  SupportExtRecord: {},
  Ability: {
    SerialNo: null,
    VoiceTipType: {},
  },
  Status: {
    NatInfo: { }
  },
  MultiLanguage: [],
  MultiVstd: "PAL|NTSC",
  General: { 
    General: {},
    Location: {},
    AutoMaintain: {}
  },
  OPTimeQuery: '',
  ChannelTitle: [],
  AuthorityList: [],
  Groups: [],
  Users: [],
  System: { 
    ExUserMap: {},
    TimeZone: {}
  },
  AVEnc: {
    EncodeStaticParam: [],
    SmartH264V2: [ {} ],
    VideoWidget: []
  },
  EncodeCapability: {},
  Simplify: {
    Encode: [],
  },
  Encode264ability: {},
  OEMcfg: {
    Correspondent: {}
  },
  BlindCapability: {},
  fVideo: {
    GUISet: {}
  },
  PTZProtocol: [],
  Uart: {
    PTZ: [],
    RS485: [],
    Comm: []
  },
  UartProtocol: [],
  ComProtocol: [],
  MotionArea: {},
  Detect: {
    MotionDetect: [ {} ],
    HumanDetection: [ {} ],
    BlindDetect: [ {} ],
    LossDetect: [ {} ]
  },
  HumanRuleLimit: {},
  Alarm: {
    LocalAlarm: [ {} ],
    AlarmOut: []
  },
  Storage: {
    StorageNotExist: {},
    StoragePosition: {},
    Snapshot: [ {} ]
  },
  Record: [ {} ]
};

module.exports = defDevCfg;