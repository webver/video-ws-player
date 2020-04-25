<template>
  <div id="app" >
    <p> TestApp </p>
    <div>
      <Player hostname="localhost" server="172.20.0.96" :port="8083" suuid="testCam0" :verbose="false" />
    </div>
  </div>
</template>

<script>
import Player from './components/Player.vue'

export default {
  name: 'App',
  components: {
    Player
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
