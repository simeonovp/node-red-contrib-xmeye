module.exports = function (RED) {
  'use strict'
  var settings = RED.settings;
  //sip?? const utils = require('./utils');

  function XmeyeDeviceNode(config) {
    console.log('--- enter XmeyeDeviceNode');
    console.log('--- config ' + config.toString());

    RED.nodes.createNode(this, config);

    this.deviceConfig = RED.nodes.getNode(config.deviceConfig);
    console.log('--- config.deviceConfig ' + config.deviceConfig);

    this.action = config.action;

    if (this.deviceConfig) {
      // Start listening for xmeye config node status changes
      this.deviceConfig.addListener('xmeye_status', this.onStatus);

      // Show the current xmeye config node status already
      //sip++ utils.setNodeStatus(this, 'device', this.deviceConfig.xmeyeStatus);

      this.deviceConfig.initialize();
    }

    this.on('input', function(msg, send, done) {
      const action = this.action || msg.action;

      if (!action) {
        this.warn('When no action specified in the node, it should be specified in the msg.myparam');
        return;
      }

      try {
        switch (action) {
          case "queryFiles":
            this.queryFiles(msg, done);
            return;
          default:
            //node.status({fill:"red",shape:"dot",text: "unsupported action"});
            if (done) {
              done.error("Action " + action + " is not supported");                    
              return;
            }
            else this.error("Action " + action + " is not supported");                    
        }
      }
      catch (exc) {
        if (done) {
          done.error("Action " + action + " failed: " + exc);
          return;
        }
        else this.error("Action " + action + " failed: " + exc);
      }

      if (done) done();
    });

    this.on('close', function(done) {
      if (this.listener) {
        this.deviceConfig.removeListener('xmeye_status', this.onStatus);
      }
      if (done) done();
    });

    this.onStatus = function(status) {
      //sip++ utils.setNodeStatus(this, 'device', status);
    }

    this.executeHelper = async function(msg, done) {
      const resp = await this.access.queryFiles(msg.Command, msg.MessageName, msg.MessageData);
      if (resp && resp.data) {
        this.send({payload: resp.data});
      }
      if (done) done();
    }

    this.queryFiles = async function(msg, done) {
      const resp = await this.access.queryFiles(msg.begin, msg.end); //--('2020-06-26 00:00:00', '2020-06-26 23:59:59');
      if (resp && resp.data) {
        this.log("Record count " + resp.data.length);
        resp.data.forEach(rec => {
          // rec.FileName, rec.BeginTime, rec.EndTime, rec.FileLength

    //     // Record count 1
    //     //   name /idea0/2020-06-26/001/03.20.22-03.23.14[R][@41][0].h264
    //     //   len 0x000012e8
    //     //   begin 2020-06-26 03:20:22
    //     //   end 2020-06-26 03:23:14
    //     let album = {
    //       name: rec.FileName,
    //       //Exmpl. http://localhost:3000/cam13/sd/idea0/2020-06-26/001/03.20.22-03.23.14[R][@41][0].h264
    //       doc: data.doc + rec.FileName,

    //       // //Exmpl. http://localhost:3000/cam13/sd/rec?FileName=/idea0/2020-06-26/001/03.20.22-03.23.14[R][@41][0].h264&BeginTime=2020-06-26%2003:20:22&EndTime=2020-06-26%2003:23:14
    //       // doc: data.doc + `/rec?FileName=${rec.FileName}&BeginTime=${rec.BeginTime}&EndTime=${rec.EndTime}`,
    //       meta: {
    //         line1: `size ${parseInt(rec.FileLength.substring(2), 16)}, begin ${rec.BeginTime}, end ${rec.EndTime}`
    //       }
    //     }
    //     data.albums.push(album);
        });
      }
      else {
      }
      if (done) done();
    }

    // // play sd record
    // xmeye_playback = async (cam, req, res) => {
    //   if (!cam.access) {
    //     this.error('cam access object missing for ' + cam.host);
    //     return; //TODO throw
    //   }

    //   const server = req.app.srv;
    //   if (!server) {
    //     this.log('no server defined in req');
    //     return; //TODO throw
    //   }

    //   try {
    //     const opts = {
    //       width: 640,
    //       height: 480,
    //     };
        
    //     //convert .264 file to .mp4:
    //     //ffmpeg -framerate 24 -i input.264 -c copy output.mp4
    //     //Frame rate is by default assumed to be 25. You can use the -r switch, e. g. -r 30 for 30 frames/second.

    //     //For writing to stdout: -f avi pipe:1
    //     const ffmpegargs = [
    //       "-fflags", "+nobuffer+genpts",
    //       "-analyzeduration", "1",
    //       "-probesize", "32",
    //       "-i", "pipe:", //read from stdin ("pipe:" == "pipe:0"), supported options: blocksize
    //       "-c", "copy",

    //       '-f', 'rawvideo',
    //       '-'
    //     ];
    //     let streamer = new WebStreamerServer(server, opts, ffmpegargs, inst => {
    //       streamers.delete(inst);
    //       this.log('streamers count after delete is ' + streamers.size);
    //     });

    //     streamer.onstart = async()=>{
    //       // this.log('ffmpeg started, now get record from cam');
    //       let ffmpeg = streamer.ffmpeg;

    //       try {
    //         cam.access.on('videostream:lost', ()=>{
    //           this.log('Cam videostream:lost');
    //           cam.access.disconnect();
    //         });
        
    //         let { video, audio } = await cam.access.reqPlayback(req.query, { Username: 'admin', Password: '888888' }, ffmpeg.stdin);
    //         this.log('Got stream!');
    //       }
    //       catch (e) {
    //         this.log('Failed (1):', e);
    //         cam.access.disconnect();
    //       }
    //     };
        
    //     res.render('player', { doc: req.originalUrl });
    //     streamers.add(streamer);
    //     this.log('streamers count after add is ' + streamers.size);
    //     //TODO start watchdog for start_feed
    //   }
    //   catch (e) {
    //     this.log('Failed (2):', e);
    //     cam.access.disconnect();
    //   }
    // }

    // // play sd record
    // xmeye_playback2 = async (cam, req, res) => {
    //   if (!cam.access) {
    //     this.error('cam access object missing for ' + cam.host);
    //     return; //TODO throw
    //   }

    //   const server = req.app.srv;
    //   if (!server) {
    //     this.error('ERROR: No server defined in req');
    //     return; //TODO throw
    //   }

    //   //Exmpl. /cam13/sd/idea0/2020-06-26/001/03.20.22-03.23.14[R][@41][0].h264
    //   const parts = req.path.split('/');
    //   if (parts.length < 7) {
    //     this.error('ERROR: Playback path too short');
    //     return;
    //   }
    //   if (parts[3] !== 'idea0') {
    //     this.error('ERROR: Missing "idea0" in path');
    //     return;
    //   }

    //   const FileName = [parts[0], parts[3], parts[4], parts[5], parts[6]].join('/');
    //   const BeginTime = `${parts[4]} ${parts[6].substring(0, 8)}`;
    //   const EndTime = `${parts[4]} ${parts[6].substring(9, 17)}`;

    //   try {
    //     const opts = {
    //       width: 640,
    //       height: 480,
    //     };
        
    //     //convert .264 file to .mp4:
    //     //ffmpeg -framerate 24 -i input.264 -c copy output.mp4
    //     //Frame rate is by default assumed to be 25. You can use the -r switch, e. g. -r 30 for 30 frames/second.

    //     //For writing to stdout: -f avi pipe:1
    //     const ffmpegargs = [
    //       "-fflags", "+nobuffer+genpts",
    //       "-analyzeduration", "1",
    //       "-probesize", "32",
    //       "-i", "pipe:", //read from stdin ("pipe:" == "pipe:0"), supported options: blocksize
    //       "-c", "copy",

    //       '-f', 'rawvideo',
    //       '-'
    //     ];
    //     let streamer = new WebStreamerServer(server, opts, ffmpegargs, inst => {
    //       streamers.delete(inst);
    //       this.log('streamers count after delete is ' + streamers.size);
    //     });

    //     streamer.onstart = async()=>{
    //       // this.log('ffmpeg started, now get record from cam');
    //       let ffmpeg = streamer.ffmpeg;

    //       try {
    //         cam.access.on('videostream:lost', ()=>{
    //           this.log('Cam videostream:lost');
    //           cam.access.disconnect();
    //         });

    //         let { video, audio } = await cam.access.reqPlayback(
    //           { FileName, BeginTime, EndTime }, 
    //           { Username: 'admin', Password: '888888' }, ffmpeg.stdin);
    //         this.log('Got stream!');
    //       }
    //       catch (e) {
    //         this.log('Failed (1):', e);
    //         cam.access.disconnect();
    //       }
    //     };
        
    //     res.render('player', { doc: req.originalUrl });
    //     streamers.add(streamer);
    //     this.log('streamers count after add is ' + streamers.size);
    //     //TODO start watchdog for start_feed
    //   }
    //   catch (e) {
    //     this.log('Failed (2):', e);
    //     cam.access.disconnect();
    //   }
    // }

    console.log('--- leave XmeyeDeviceNode');
  }

  RED.nodes.registerType("xmeye-device", XmeyeDeviceNode);
}
