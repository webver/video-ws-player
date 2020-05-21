<template>
    <div id="app">
        <p> TestApp </p>
        <vue-tabs active-tab-color="lightblue"
                  active-text-color="white"
                  @tab-change="handleTabChange">
            <v-tab v-for="stream in streams" :key="stream" :title="stream">
            </v-tab>
        </vue-tabs>

        <Player :server="server" :port="port" :suuid="activeStream" :verbose="true"/>
    </div>
</template>

<script>
    import axios from 'axios';
    import Player from './components/Player.vue'
    import {VueTabs, VTab} from 'vue-nav-tabs'
    import 'vue-nav-tabs/themes/vue-tabs.css'

    export default {
        name: 'App',
        props: {
            server: {
                type: String,
                default: "localhost"
            },
            port: {
                type: Number,
                default: 8083
            },
        },
        components: {
            Player,
            VueTabs,
            VTab
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
                })
                .catch(error => {
                    console.log(error)
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
