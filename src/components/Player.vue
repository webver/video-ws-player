<template>
    <video ref="livestream" class="videosize" preload="auto" controls autoplay muted></video>
</template>

<script>
    // import axios from 'axios';
    import Hls from 'hls.js';

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
            }
        },
        watch: {
            suuid: function () { // watch it
                // if ('MediaSource' in window) {
                //     this.stop(() => {
                //         this.start();
                //     });
                // } else {
                    this.startHls()
                // }
            }
        },
        data: function () {
            return {
                isInited: false,
                isPlaying: false,
                streamingStarted: false,
                ms: null,
                queue: [],
                ws: null,
                sourceBuffer: null,
                hls: null
            };
        },
        mounted() {
            this.initialize()
        },
        beforeDestroy() {
            if ('MediaSource' in window) {
                this.stop()
            } else {
                if (Hls.isSupported()) {
                    this.hls.destroy()
                }
            }
        },
        methods: {
            initialize() {
            //     if ('MediaSource' in window) {
            //         this.ms = new MediaSource()
            //         this.ms.addEventListener('sourceopen', this.start, false);
            //         this.$refs["livestream"].src = window.URL.createObjectURL(this.ms);
            //         this.$refs["livestream"].onpause = () => {
            //             console.log("The video " + this.suuid + " has been paused");
            //             this.stop();
            //         };
            //         this.$refs["livestream"].onplay = () => {
            //             console.log("The video " + this.suuid + " has been started");
            //             if (this.isPlaying === false) {
            //                 this.start();
            //             }
            //         };
            //         this.$refs["livestream"].onwaiting = () => {
            //             console.log("The video " + this.suuid + " waiting");
            //         };
            //         this.$refs["livestream"].onplaying = () => {
            //             console.log("The video " + this.suuid + " playing");
            //         };
            //         this.$refs["livestream"].onstalled = () => {
            //             console.log("The video " + this.suuid + " stalled");
            //         };
            //         this.isInited = true;
                //} else {
                    console.error("Unsupported MSE");
                    if (this.suuid != null) {
                        this.startHls()
                    }
                //}

            },
            start() {
                this.isPlaying = true;
                let protocol = 'ws';
                if (location.protocol.indexOf('s') >= 0) {
                    protocol = 'wss';
                }
                this.ws = new WebSocket(protocol + "://" + this.server + ":" + this.port + "/ws/live?suuid=" + this.suuid);
                this.ws.binaryType = "arraybuffer";
                this.ws.onopen = (event) => {
                    console.log('Socket opened', event);
                }
                this.ws.onclose = (event) => {
                    console.log('Socket closed', event);
                    if (this.isPlaying === true) {
                        setTimeout(() => {
                            this.start();
                        }, 1000);
                    }
                }
                this.ws.onerror = (err) => {
                    console.error('Socket encountered error: ', err.message, 'Closing socket');
                    this.ws.close();
                };
                this.ws.onmessage = (event) => {
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
            },
            stop(callback) {
                if (this.isInited) {
                    this.isPlaying = false;
                    if (this.ws) {
                        this.ws.close();
                        setTimeout(() => {
                            this.clearBuffer();
                            if (callback && typeof callback == "function") {
                                callback();
                            }
                        }, 100);
                    }
                }
            },
            clearBuffer() {
                if (this.sourceBuffer && !this.sourceBuffer.updating) {
                    if (this.$refs["livestream"].currentTime > 0) {
                        this.sourceBuffer.remove(0, this.$refs["livestream"].currentTime);
                    }
                    this.$refs["livestream"].currentTime = 0
                }
            },
            pushPacket(arr) {
                let view = new Uint8Array(arr);
                if (this.verbose) {
                    console.log("got", arr.byteLength, "bytes.  Values=", view[0], view[1], view[2], view[3], view[4]);
                    console.log("Current time: ", this.$refs["livestream"].currentTime);
                    if (this.$refs["livestream"].buffered.length > 0) {
                        console.log("Buffered time: ", this.$refs["livestream"].buffered.start(0), this.$refs["livestream"].buffered.end(0));
                    }
                }
                if (this.$refs["livestream"].buffered.length > 0) {
                    if (this.$refs["livestream"].buffered.end(0) - this.$refs["livestream"].currentTime > 3) {
                        this.$refs["livestream"].currentTime = this.$refs["livestream"].buffered.end(0);
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
            },
            loadPacket() {
                if (!this.sourceBuffer.updating) {
                    if (this.queue.length > 0) {
                        let inp = this.queue.shift();
                        if (this.verbose) {
                            console.log("queue pull:", this.queue.length);
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
            startHls() {
                const video = this.$refs["livestream"]
                const videoSrc = "http://" + this.server + ":" + this.port + "/hls/" + this.suuid + ".m3u8";
                if (Hls.isSupported()) {
                    this.hls = new Hls();
                    this.hls.attachMedia(video);
                    this.hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                        console.log("video and hls.js are now bound together !");
                        this.hls.loadSource(videoSrc);
                        this.hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
                            console.log("manifest loaded, found " + data.levels.length + " quality level");
                            video.play();
                        });
                    });
                    this.hls.on(Hls.Events.ERROR, (event, data) => {
                        if (data.fatal) {
                            switch(data.type) {
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    // try to recover network error
                                    console.log("fatal network error encountered, try to recover");
                                    this.hls.startLoad();
                                    break;
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log("fatal media error encountered, try to recover");
                                    this.hls.recoverMediaError();
                                    break;
                                default:
                                    // cannot recover
                                    this.hls.destroy();
                                    break;
                            }
                        }
                    });
                }
                else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = videoSrc;
                    video.addEventListener('loadedmetadata', function() {
                        video.play();
                    });
                }
            }
        }
    };
</script>

<style scoped>
    .videosize {
        /*position: absolute;*/
        z-index: -1;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
</style>