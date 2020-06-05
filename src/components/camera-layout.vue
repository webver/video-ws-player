<template>
    <div>
        <!--        <dragResize panel="camera-new" style="z-index: 55">-->
        <div>
            <video ref="livestream" class="videosize" playsinline muted></video>

        </div>
        <div style="display: flex;" ref="current_time"></div>
        <div style="display: flex;" ref="buffer_time"></div>
        <div style="display: flex;" ref="log"> "Log" <br></div>

        <!-- <video ref="livestream" class="videosize" playsinline controls autoplay muted></video> -->
        <!--        </dragResize>-->
        <!--        <dragResize panel="camera-old" style="z-index: 55">-->
        <!--            <cameraOld />-->
        <!--        </dragResize>-->

    </div>

</template>

<script>

    // import dragResize  from './camera-dragResize';
    // import cameraOld from './camera-old';

    export default {
        name: 'video-player',
        components: {
            // dragResize,
            // cameraOld
        },
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
            };
        },
        mounted() {
            this.initialize()
        },
        beforeDestroy() {
            this.isPlaying = false;
            this.stop()
        },
        methods: {
            initialize() {
                if ('MediaSource' in window) {
                    this.ms = new MediaSource()
                    this.ms.addEventListener('sourceopen', this.start, false);
                    this.$refs["livestream"].src = window.URL.createObjectURL(this.ms);
                    this.$refs["livestream"].onpause = () => {
                        console.log("The video has been paused");
                        this.log("onPause")
                        this.stop();
                    };
                    this.$refs["livestream"].onplay = () => {
                        console.log("The video has been started");
                        this.log("onPlay")
                        if (this.isPlaying === false) {
                            this.start();
                        }
                    };
                    this.isInited = true;
                } else {
                    this.log("Unsupported MSE")
                    console.error("Unsupported MSE");
                }

            },
            start() {
                this.log("start")
                this.isPlaying = true;
                let protocol = 'ws';
                if (location.protocol.indexOf('s') >= 0) {
                    protocol = 'wss';
                }
                this.ws = new WebSocket(protocol + "://" + this.server + ":" + this.port + "/ws/live?suuid=" + this.suuid);
                this.ws.binaryType = "arraybuffer";
                this.ws.onopen = (event) => {
                    this.log("Ws opened")
                    console.log('Socket opened', event);
                }
                this.ws.onclose = (event) => {
                    this.log("Ws close")
                    console.log('Socket closed', event);
                    if (this.isPlaying === true) {
                        setTimeout(() => {
                            this.start();
                        }, 1000);
                    }
                }
                this.ws.onerror = (err) => {
                    console.error('Socket encountered error: ', err.message, 'Closing socket');
                    this.log("Ws error")
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
            stop() {
                // this.log("Stop" + this.isInited + this.ws)
                if (this.isInited && this.ws) {
                    this.log("stop")
                    this.$refs["livestream"].pause()
                    this.ws.close()
                    this.clearBuffer()
                }
            },
            clearBuffer() {
                if (this.sourceBuffer && !this.sourceBuffer.updating) {
                    this.log("Reset current time1")
                    if (this.$refs["livestream"].currentTime > 0) {
                        this.sourceBuffer.remove(this.$refs["livestream"].buffered.start(0), this.$refs["livestream"].buffered.end(0));
                    }
                    this.log("Reset current time2")
                    this.$refs["livestream"].currentTime = this.$refs["livestream"].buffered.start(0)
                    this.log("Reset current time3")
                }
            },
            pushPacket(arr) {
                let view = new Uint8Array(arr);
                const video = this.$refs["livestream"]
                if (this.verbose) {
                    console.log("got", arr.byteLength, "bytes.  Values=", view[0], view[1], view[2], view[3], view[4]);
                    console.log("Current time: ", video.currentTime);
                    // console.log(video)
                    this.curTimeShow("Current time: " + video.currentTime);
                    if (video.buffered.length > 0) {
                        console.log("Buffered time: ", video.buffered.start(0), video.buffered.end(0));
                        this.bufferShow("Buffered time: " + video.buffered.start(0) + " ... " + video.buffered.end(0));
                    }
                }
                if (video.buffered.length > 0) {
                    if (video.buffered.end(0) - video.currentTime > 3) {
                        video.currentTime = video.buffered.end(0);
                    }

                    if (video.buffered.end(0) - video.currentTime < 1) {
                        const newTime = video.buffered.end(0) - 1
                        if (newTime > 0) {
                            video.currentTime = newTime;
                            if (video.paused) {
                                //1 sec delayed start
                                video.play();
                                this.log("Play")
                            }
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
            log(msg) {
                this.$refs["log"].innerHTML += msg + '<br>'
                console.log(msg)
            },
            curTimeShow(currentTime) {
                this.$refs["current_time"].innerHTML = currentTime
            },
            bufferShow(bufferTime) {
                this.$refs["buffer_time"].innerHTML = bufferTime
            }

        }
    };
</script>

<style scoped lang="stylus">
    .videosize
        background: rgba(0, 0, 0, 0.5);
        position: absolute;
        z-index: 50;
        // left: 100px;
        // width:394px;
        width: 100%
        height: auto;
        // height:220px;
        // top:37px;
        // top: 0;
        // left: 0;
        // width: 100%;
        // height: 100%;
        object-fit: cover;

    @media screen and ( max-width: 414px )
        .videosize
            pointer-events: auto
            // bottom: 115px;
            left: 0;
            right: 0;
            top: 35px
            // top:75px
            height: auto
            width: 100%
</style>
