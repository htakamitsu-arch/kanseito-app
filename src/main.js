// ============================================================================
// 画面の入口。index.html の <div id="app"> に App.vue を描く。ここは触らない。
// ============================================================================
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

createApp(App).mount('#app')
