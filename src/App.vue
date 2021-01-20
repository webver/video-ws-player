<template>
    <div id="app">
        <VideoPlayer :server="server" :port="port" suuid="37e8df8f-6062-489b-8fad-3b76952965d7" :verbose="true"/>
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
                default: "77.108.87.134"
            },
            port: {
                type: Number,
                default: 37896
            },
        },
        components: {
            VideoPlayer,
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
