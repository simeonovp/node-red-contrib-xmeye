const {PassThrough} = require("stream");

const VideopacketPayloads = require("./VideopacketPayloads");
const MessageIds = require("./Messages");

const {VideoPacketParser} = require("./Parsers");

const DVRIPClient = require("./dvripclient");

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

	dataParser(responseBuffer) {
		if(DEBUG) {
			console.log("(2)> ", responseBuffer.toString("ascii"));
			console.log("hex(2):", responseBuffer.toString("hex"));
			console.log("");
		}
		const MessageId = responseBuffer.readUInt16LE(HEADER_MESSAGEID_OFFSET);

    if(this._videoStream) {
      if((MessageId === MessageIds.MONITOR_DATA) || (MessageId === MessageIds.PLAY_DATA)) {
        let {RawBody} = VideoPacketParser.parse(responseBuffer);

        //0x000001 = NAL Unit Seperator
        if(RawBody[0] !== 0 || RawBody[1] !== 0 || RawBody[2] !== 1) {
          return this._videoStream.write(RawBody);
        }

        let PayloadType = RawBody[3];

        if(PayloadType === VideopacketPayloads.Audio) {
          return this._audioStream.write(RawBody.slice(8));
        }
        //Failing to remove these 8-16 bytes for these messages for some reason makes FFMPEG unhappy.
        //The output is apparently still a valid video stream.
        this.chunks += 1;
        if(PayloadType === VideopacketPayloads.IFrame || PayloadType === VideopacketPayloads.PlusEnc) {
          return this._videoStream.write(RawBody.slice(16));
        }
        else {
          return this._videoStream.write(RawBody.slice(8));
        }
      }
      if (this.logActive()) {
        console.error("Stream client dataParser no match " + this.logs);
      }
    }
    else if (this.logActive()) {
      //console.log("-- stream client dataParser no video " + this.logs);
      if (!this.chunks) this.chunks = 0;
    }
    return super.dataParser(responseBuffer);
	}

	disconnect() {
    console.log("-- stream client received video chunks " + this.chunks);
    
    super.disconnect();

		if(this._videoStream) {
			setImmediate(() => {
				if(!this._videoStream)
					return;

				this._videoStream.end();

				this._videoStream.destroy();

				delete this._videoStream;
			});
		}

		if(this._audioStream) {
			setImmediate(() => {
				if(!this._audioStream)
					return;

				this._audioStream.end();

				this._audioStream.destroy();

				delete this._audioStream;
			});
		}

		if(this._socket)
			delete this._socket;
	}

	/**
	 * Claim video stream on this connection, thus allowing the parent connection to start it
	 *
	 * @param {Object} streamInfo
	 * @param {string} [streamInfo.StreamType="Main"] Substream to claim. Known to work are "Main" and "Extra1"
	 * @param {string} [streamInfo.Channel=0] Videochannel to claim. Probably only useful for DVR's and not for IP Cams
	 * @param {string} [streamInfo.CombinMode="CONNECT_ALL"] Unknown. "CONNECT_ALL" and "NONE" work
	 * @returns {Promise} Promise resolves with {@link DVRIPCommandResponse} of called underlying command
	 */
	async claimVideoStream({StreamType = "Main", Channel = 0, CombinMode = "CONNECT_ALL"}) {
		const Result = await this.executeHelper("MONITOR_CLAIM", "OPMonitor", {
			Action: "Claim",
			Parameter: {Channel, CombinMode, StreamType, TransMode: "TCP"}
		});

		this._socket.setTimeout(5000);

		this._videoStream = new PassThrough();
		this._audioStream = new PassThrough();

		return Result;
	}

  async claimPlayback(parameter, start, end, res) {
    const OPPlayBack = {
      Action : 'Claim',
      EndTime : end,
      Parameter : parameter,
      StartTime : start
    };

    //-- console.log('-- claim playback');
    let Result = await this.executeHelper('PLAY_CLAIM', 'OPPlayBack', OPPlayBack);
    //-- console.log('-- claim playback success');
    this._socket.setTimeout(15000);
		this._videoStream = new PassThrough();
		this._audioStream = new PassThrough();
    //-- console.log('-- playback streams allocated');

    return Result;
	}
}

module.exports = DVRIPStreamClient;