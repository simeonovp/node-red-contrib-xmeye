const {PassThrough} = require('stream');

const VideopacketPayloads = require('./VideopacketPayloads');
const MessageIds = require('./Messages');

const {VideoPacketParser} = require('./Parsers');

const DVRIPClient = require('./dvripclient');

const HEADER_MESSAGEID_OFFSET = 14;

const DEBUG = false;

/**
 * Extension of DVRIPClient to support Audio / Videostreaming
 * @extends DVRIPClient
 */
class DVRIPStreamClient extends DVRIPClient {
  logActive() {
    if (this.logs && (this.logs > 3)) return false;
    if (this.logs) this.logs += 1;
    else this.logs = 1;
    return true
  }

	dataLog(str) {
		console.log(str);
	}

	// override base class method
	dataParser(responseBuffer) {
		if(DEBUG) {
			console.log('(2)> ', responseBuffer.toString('ascii'));
			console.log('hex(2):', responseBuffer.toString('hex'));
			console.log('');
		}
		const MessageId = responseBuffer.readUInt16LE(HEADER_MESSAGEID_OFFSET);

    if(this.onVideoFrame) {
      // console.log('-- video frame, MessageId ' + MessageId);
      if((MessageId === MessageIds.MONITOR_DATA) || (MessageId === MessageIds.PLAY_DATA)) {
        let {RawBody} = VideoPacketParser.parse(responseBuffer);

        this.chunks += 1;
        //0x000001 = NAL Unit Seperator
        if((RawBody[0] !== 0) || (RawBody[1] !== 0) || (RawBody[2] !== 1)) {
					this._vsize += RawBody.length;
          return this.onVideoFrame(RawBody);
        }

        let PayloadType = RawBody[3];
        if(PayloadType === VideopacketPayloads.Audio) {
          if (!this._audioFrame) return;
          return this._audioFrame(RawBody.slice(8));
        }

        //Failing to remove these 8-16 bytes for these messages for some reason makes FFMPEG unhappy.
        //The output is apparently still a valid video stream.
        if((PayloadType === VideopacketPayloads.IFrame) || (PayloadType === VideopacketPayloads.PlusEnc)) {
					this._vsize += RawBody.length - 16;
          return this.onVideoFrame(RawBody.slice(16));
        }
        else {
					this._vsize += RawBody.length - 8;
          return this.onVideoFrame(RawBody.slice(8));
        }
      }
      if (this.logActive()) {
        console.error('Stream client dataParser no match ' + this.logs);
      }
    }
    else {
      //console.log('-- S no video, type ' + this._type);
			if (this.logActive()) {
      	console.log('-- stream client dataParser no video ' + this.logs);
      	if (!this._vsize) this._vsize = 0;
      	if (!this.chunks) this.chunks = 0;
			}
    }
    return super.dataParser(responseBuffer);
	}

	disconnect() {
    if(this._socket) console.log(`-- stream client received video chunks ${this.chunks}, len ${this._vsize}`);
    
    super.disconnect();

		if(this._socket) delete this._socket;
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
	async claimVideoStream({StreamType = 'Main', Channel = 0, CombinMode = 'CONNECT_ALL'}) {
		const Result = await this.executeHelper('MONITOR_CLAIM', 'OPMonitor', {
			Action: 'Claim',
			Parameter: {Channel, CombinMode, StreamType, TransMode: 'TCP'}
		});

		this._socket.setTimeout(5000);
		this.claimed = true;

		return Result;
	}

	reuseSession(sessionId) {
		this._isLoggedIn = true;
    this.setSessionId(sessionId);
	}
}

module.exports = DVRIPStreamClient;