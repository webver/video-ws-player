<template>
    <div id="app">
        <p> TestApp </p>
<!--        <vue-tabs active-tab-color="lightblue"-->
<!--                  active-text-color="white"-->
<!--                  @tab-change="handleTabChange">-->
<!--            <v-tab v-for="stream in streams" :key="stream" :title="stream">-->
<!--            </v-tab>-->
<!--        </vue-tabs>-->

        <VideoPlayer :server="server" :port="port" suuid="testCam0" :verbose="true"/>
    </div>
</template>

<script>
    import axios from 'axios';
    import VideoPlayer from './components/camera-layout.vue'
   // import {VueTabs, VTab} from 'vue-nav-tabs'
    import 'vue-nav-tabs/themes/vue-tabs.css'

    export default {
        name: 'App',
        props: {
            server: {
                type: String,
                default: "192.168.88.226"
            },
            port: {
                type: Number,
                default: 8083
            },
        },
        components: {
            VideoPlayer,
            // VueTabs,
            // VTab
        },
        data: function () {
            return {
                streams: [],
                activeStream: null
            }
        },
        mounted() {
            axios
                .get("http://" + this.server + ":" + this.port + "/list")
                .then((response) => {
                    this.streams = response.data;
                    if (this.streams.length > 0) {
                        this.activeStream = this.streams[0]
                    }
                });
        },
        methods:{
            handleTabChange(tabIndex){
                this.activeStream = this.streams[tabIndex];
            }
        }
    }
</script>

<style>
    #app {
        font-family: Avenir, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-align: center;
        color: #2c3e50;
        margin-top: 60px;
    }
</style>
