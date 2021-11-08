const
  MessageIds = require("./Messages");

const HEADER_LENGTH_BYTES = 20;
const HEADER_SEESIONID_OFFSET = 4;
const HEADER_CMDSEQ_OFFSET = 8;
const HEADER_RESERVED_OFFSET = 2;
const HEADER_CMD_OFFSET = 14;
const HEADER_SIZE_OFFSET = 16;

class Message {
  constructor(msgId) {
    this.header = 0xff;
    this.cmdSeq = 0;
    this.sessionId = 0;
    this.reserved = 0;
    this.messageId = msgId;
    this.dataLen = 0;
    this.data = {};
  }

  get Message {
    let cmd = '(unknown)' + this.msgId;
    Object.keys(MessageIds).forEach(key=>{
      if (MessageIds[key] == this.msgId) {
        cmd = key;
      }
    });
    return cmd;
  }
  
  read(buf, pos) {
    this.header = buf.readUInt32LE(pos + 0);
    this.sessionId = buf.readUInt32LE(pos + HEADER_SEESIONID_OFFSET);
    this.cmdSeq = buf.readUInt32LE(pos + HEADER_CMDSEQ_OFFSET);
    this.reserved = buf.readUInt16LE(pos + HEADER_RESERVED_OFFSET);
    this.messageId = buf.readUInt16LE(pos + HEADER_CMD_OFFSET);
    this.dataLen = buf.readUInt32LE(pos + HEADER_SIZE_OFFSET);
    this.data = buf.slice(pos + HEADER_LENGTH_BYTES, start + HEADER_LENGTH_BYTES + this.dataLen).toString();
  }

  Command() {
    //TODO
  }
}

class RequesteMessage extends Message {
  constructor(msg, name) {
    super(MessageIds[Command]);
    this.data.Name = name;
    this.data[name] = {}; 
    this.data.SessionID = 0;
  }

  KeepAlive() { return this.Command('KEEPALIVE_REQ', 'KeepAlive'); }

  SystemFunction() { return this.Command('ABILITY_GET', 'SystemFunction'); }

  SystemInfo() { return this.Command('SYSINFO_REQ', 'SystemInfo'); }
}

class ResponseMessage extends Message {
  constructor(msg, name) {
    super(MessageIds[Command]);
    this.data.Name = 'name';
    this.data.Ret = 100; 
    this.data.SessionID = 0;
  }
}
