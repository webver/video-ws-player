<template>
    <div class="videosize">
        <video ref="livestream" class="videosize" playsinline muted></video>
    </div>
</template>

<script>

export default {
  name: 'video-player',
  props: {
    server: {
      type: String,
      default: "localhost"
    },
    port: {
      type: Number,
      default: 8083
    },
    suuid: {
      type: String,
      default: ""
    },
    verbose: {
      type: Boolean,
      default: false
    },
    mobile: {
      type: Boolean,
      default: true
    },
    visibleCameras: {
      type: Array,
      default: () => ([
        'new',
      ])
    },
  },
  data: function () {
    return {
      isInited: false,
      isPlaying: false,
      timeoutStart: null,
      streamingStarted: false,
      ms: null,
      queue: [],
      ws: null,
      sourceBuffer: null,
      playPromise: null,
      keepAliveTimer: null
    };
  },

  mounted() {
    this.initialize()
  },

  beforeDestroy () {

    this.isPlaying = false;
    this.stop()
    console.log('Main Vue destroyed')
  },

  methods: {

    initialize () {
      if ('MediaSource' in window) {
        this.ms = new MediaSource()
        this.ms.addEventListener('sourceopen', this.start, false);
        if (this.$refs["livestream"]) {
          this.$refs["livestream"].src = window.URL.createObjectURL(this.ms);
          this.$refs["livestream"].onpause = () => {
            console.log("The video has been paused");
            this.stop();
          };
          this.$refs["livestream"].onplay = () => {
            console.log("The video has been started");
            if (this.isPlaying === false) {
              this.start();
            }
          };
        }
        this.isInited = true;
      } else {
        console.error("Unsupported MSE");
      }

    },

    start () {
      console.trace()

      this.isPlaying = true;
      let protocol = 'ws';
      if (location.protocol.indexOf('s') >= 0) {
        protocol = 'wss';
      }
      this.ws = new WebSocket(protocol + "://" + this.server + ":" + this.port + "/ws/live?suuid=" + this.suuid);
      this.ws.binaryType = "arraybuffer";
      this.ws.onopen = (event) => {
        console.log('Socket opened', event);
        this.clearBuffer()
        let pingTimer = setInterval(() => {
          if (this.ws != null && this.ws.readyState === WebSocket.OPEN) {
            console.log("Send ping")
            this.ws.send("ping")
            this.keepAliveTimer = setTimeout(() => {
              console.log("Close connection - no pong")
              clearInterval(pingTimer)
              if (this.ws != null) {
                this.ws.close()
              }
            }, 3000);
          } else {
            console.log("No need to send ping")
          }
        }, 5000)
      }
      this.ws.onclose = (event) => {
        console.log('Socket closed', event);
        if (this.isPlaying === true) {
          delete this.ws
          this.timeoutStart = setTimeout(() => {
            this.start();
          }, 1000);
        }
      }
      this.ws.onerror = (err) => {
        console.error('Socket encountered error: ', err.message, 'Closing socket');
        this.ws.close();
      };
      this.ws.onmessage = (event) => {
        if (typeof event.data === "string" && event.data === "pong") {
          console.log("Get pong")
          if (this.keepAliveTimer != null) {
            clearTimeout(this.keepAliveTimer)
          }
        } else {
          const data = new Uint8Array(event.data);
          if (data[0] === 9) {
            let decoded_arr = data.slice(1);
            let mimeCodec;
            if (window.TextDecoder) {
              mimeCodec = new TextDecoder("utf-8").decode(decoded_arr);
            } else {
              //mimeCodec =Utf8ArrayToStr(decoded_arr);
              mimeCodec = String.fromCharCode(decoded_arr)
            }
            if (this.verbose) {
              console.log('first packet with codec data: ' + mimeCodec);
            }
            if (!this.sourceBuffer) {
              this.sourceBuffer = this.ms.addSourceBuffer('video/mp4; codecs="' + mimeCodec + '"');
              this.sourceBuffer.mode = "segments"
              this.sourceBuffer.addEventListener("updateend", this.loadPacket);
            }
          } else {
            this.pushPacket(event.data);
          }
        }
      }
    },
    stop () {
      if (this.isInited && this.ws) {
        if (this.playPromise !== undefined) {
          this.playPromise.then(_ => {
            // Automatic playback started!
            // Show playing UI.
            // We can now safely pause video...
            console.log(_)
            this.$refs["livestream"]?.pause()
            this.ws.close()
            clearTimeout(this.timeoutStart)
            this.timeoutStart = null
            this.clearBuffer()
          }).catch(error => {
            // Auto-play was prevented
            // Show paused UI.
            console.log(error)
          });
        } else {
          this.$refs["livestream"]?.pause()
          this.ws.close()
          clearTimeout(this.timeoutStart)
          this.timeoutStart = null
          this.clearBuffer()
        }
      }
    },
    clearBuffer() {
      if (this.sourceBuffer && !this.sourceBuffer.updating && this.$refs["livestream"] && this.$refs["livestream"]?.buffered?.length) {
        if (this.$refs["livestream"].currentTime > 0) {
          this.sourceBuffer.remove(this.$refs["livestream"].buffered.start(0), this.$refs["livestream"].buffered.end(0));
        }
        this.$refs["livestream"].currentTime = this.$refs["livestream"].buffered.start(0)
      }
    },
    pushPacket(arr) {
      let view = new Uint8Array(arr);
      const video = this.$refs["livestream"]
      if (video) {
        if (this.verbose) {
          console.log("got", arr.byteLength, "bytes.  Values=", view[0], view[1], view[2], view[3], view[4]);
          console.log("Current time: ", video.currentTime);
          if (video.buffered.length > 0) {
            console.log("Buffered time: ", video.buffered.start(0), video.buffered.end(0));
          }
        }
        if (video.buffered.length > 0) {
          if (video.buffered.end(0) - video.currentTime > 3) {
            video.currentTime = video.buffered.end(0) - 1;
          } else if (video.buffered.end(0) - video.currentTime > 1) {
            // const newTime = video.buffered.end(0)
            // if (newTime > 0) {
            //   video.currentTime = newTime;
            if (video.paused) {
              //1 sec delayed start
              this.playPromise = video.play();
            }
            // }
          }
        }
      }
      let data = arr;
      if (!this.streamingStarted) {
        this.sourceBuffer.appendBuffer(data);
        this.streamingStarted = true;
        return;
      }
      this.queue.push(data);
      if (this.verbose) {
        console.log("queue push:", this.queue.length);
      }
      if (!this.sourceBuffer.updating) {
        this.loadPacket();
      }
      // let view = new Uint8Array(arr);
      // if (this.verbose) {
      //     console.log("got", arr.byteLength, "bytes.  Values=", view[0], view[1], view[2], view[3], view[4]);
      // }
      // let data = arr;
      // if (!this.streamingStarted) {
      //     this.sourceBuffer.appendBuffer(data);
      //     this.streamingStarted = true;
      //     return;
      // }
      // this.queue.push(data);
      // if (this.verbose) {
      //     console.log("queue push:", this.queue.length);
      // }
      // if (!this.sourceBuffer.updating) {
      //     this.loadPacket();
      // }
    },
    loadPacket() {
      if (!this.sourceBuffer.updating) {
        if (this.queue.length > 0) {
          let inp = this.queue.shift();
          if (this.verbose) {
            console.log("queue PULL:", this.queue.length);
          }
          let view = new Uint8Array(inp);
          if (this.verbose) {
            console.log("writing buffer with", view[0], view[1], view[2], view[3], view[4]);
          }
          this.sourceBuffer.appendBuffer(inp);
        } else {
          this.streamingStarted = false;
        }
      }
    },
    onClickCloseCameraNew() {
      this.isPlaying = false
      this.stop()
      this.$emit('hideCamera', 'new')
    },
    onClickCloseCameraOld() {
      this.$emit('hideCamera', 'old')
    },
  }
}
</script>

<style scoped lang="stylus">
    .videosize
        background: rgba(0, 0, 0, 0.5);
        position: absolute;
        //width: 100%
        //height: auto;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;

    //@media screen and ( max-width: 414px )
    //    .videosize
    //        pointer-events: auto
    //        // bottom: 115px;
    //        left: 0;
    //        right: 0;
    //        top: 0px
    //        // top:75px
    //        height: auto
    //        width: 100%
</style>
