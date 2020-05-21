<template>
    <video ref="livestream" class="videosize" preload="auto" controls autoplay muted></video>
</template>

<script>
    import axios from 'axios';

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
                if ('MediaSource' in window) {
                    this.stop(() => {
                        this.start();
                    });
                } else {
                    this.startWebRtc()
                }
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
                peerConnection: null,
                sendChannel: null,
                pingTimeoutId: null
            };
        },
        mounted() {
            this.initialize()
        },
        beforeDestroy() {
            if ('MediaSource' in window) {
                this.stop()
            }
        },
        methods: {
            initialize() {
                if ('MediaSource' in window) {
                    this.ms = new MediaSource()
                    this.ms.addEventListener('sourceopen', this.start, false);
                    this.$refs["livestream"].src = window.URL.createObjectURL(this.ms);
                    this.$refs["livestream"].onpause = () => {
                        console.log("The video " + this.suuid + " has been paused");
                        this.stop();
                    };
                    this.$refs["livestream"].onplay = () => {
                        console.log("The video " + this.suuid + " has been started");
                        if (this.isPlaying === false) {
                            this.start();
                        }
                    };
                    this.$refs["livestream"].onwaiting = () => {
                        console.log("The video " + this.suuid + " waiting");
                    };
                    this.$refs["livestream"].onplaying = () => {
                        console.log("The video " + this.suuid + " playing");
                    };
                    this.$refs["livestream"].onstalled = () => {
                        console.log("The video " + this.suuid + " stalled");
                    };
                    this.inited = true;
                } else {
                    console.error("Unsupported MSE");
                    if (this.suuid) {
                        this.startWebRtc()
                    }
                }

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
                if (this.inited) {
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
            /*---------------*/
            startWebRtc() {
                let config = {
                    iceServers: [{
                        urls: ["turn:numb.viagenie.ca"],
                        username: "it@mgtniip.ru",
                        credential: "1qaz@WSX",
                    }]
                };
                this.peerConnection = new RTCPeerConnection(config);
                this.peerConnection.ononicecandidate = (event) => {
                    console.log("On ice candidate", event)
                }
                this.peerConnection.onnegotiationneeded = async () => {
                    let offer = await this.peerConnection.createOffer();
                    await this.peerConnection.setLocalDescription(offer);
                    console.log("Get remote sdp")
                    this.getRemoteSdp();
                };

                this.peerConnection.ontrack = (event) => {
                    console.log(event.streams.length + ' track is delivered')
                    this.$refs["livestream"].srcObject = event.streams[0]
                }
                this.peerConnection.oniceconnectionstatechange = e => {
                    console.log(this.peerConnection.iceConnectionState, e)
                    if (this.peerConnection.iceConnectionState === "disconnected") {
                        clearInterval(this.pingTimeoutId)
                        setTimeout(() => {
                            this.peerConnection?.close()
                            //this.sendChannel.close()
                            this.startWebRtc()
                        }, 1000);
                    }
                }
                console.log(this.suuid)
                this.getCodecInfo()
            },
            getCodecInfo() {
                axios.get("http://" + this.server + ":" + this.port + "/codec/" + this.suuid)
                    .then(response => {
                        try {
                            const data = response.data
                            if (data.length > 1) {
                                console.log('add audio Transceiver')
                                this.peerConnection.addTransceiver('audio', {
                                    'direction': 'recvonly'
                                })
                            }
                        } catch (e) {
                            console.log(e);
                        } finally {
                            console.log('add video Transceiver')
                            this.peerConnection.addTransceiver('video', {
                                'direction': 'recvonly'
                            });
                            //send ping becouse PION not handle RTCSessionDescription.close()
                            this.sendChannel = this.peerConnection.createDataChannel('foo');
                            this.sendChannel.onclose = () => console.log('sendChannel has closed');
                            this.sendChannel.onopen = () => {
                                console.log('sendChannel has opened');
                                this.sendChannel.send('ping');
                                this.pingTimeoutId = setInterval(() => {
                                    this.sendChannel.send('ping');
                                }, 1000)
                            }
                            this.sendChannel.onmessage = e => console.log(`Message from DataChannel '${this.sendChannel.label}' payload '${e.data}'`);
                        }
                    }).catch(error => {
                    console.log(error)
                });
            },
            getRemoteSdp() {
                axios.post("http://" + this.server + ":" + this.port + "/recive", {
                    suuid: this.suuid,
                    data: btoa(this.peerConnection.localDescription.sdp)
                }).then(response => {
                    try {
                        this.peerConnection.setRemoteDescription(new RTCSessionDescription({
                            type: 'answer',
                            sdp: atob(response.data)
                        }))
                    } catch (e) {
                        console.warn(e);
                    }
                }).catch(error => {
                    console.log(error)
                });
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