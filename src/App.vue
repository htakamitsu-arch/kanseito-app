<!-- ============================================================================
  画面の骨組み(全画面に共通する部分)。
    上の帯: タイトル・画面の切替(①今の状態 / ②日報 / ③カルテ)・ログイン中の人
    真ん中: いま選ばれている画面(pages/ の中の1ファイル)

  画面の切替は URL の「#」の後ろで決める(例: https://…/#/now)。
    #/now   → 画面① NowStatus.vue
    #/daily → 画面② DailyReport.vue
    #/karte → 画面③ MachineKarte.vue
  「#」方式にしてあるのは、GitHub Pages で URL を直打ちしても 404 にならないため。
============================================================================ -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase, IS_MOCK, configProblem } from './lib/supabase.js'
import NowStatus from './pages/NowStatus.vue'
import DailyReport from './pages/DailyReport.vue'
import MachineKarte from './pages/MachineKarte.vue'
import Login from './pages/Login.vue'

// ---- 画面の切替(#の後ろ) ----
const pages = {
  '/now':   { title: '① 今の状態', comp: NowStatus },
  '/daily': { title: '② 日報',     comp: DailyReport },
  '/karte': { title: '③ カルテ',   comp: MachineKarte },
}
const route = ref(currentRoute())
function currentRoute() {
  const h = location.hash.replace(/^#/, '') || '/now'
  return pages[h] ? h : '/now'
}
window.addEventListener('hashchange', () => { route.value = currentRoute() })
const page = computed(() => pages[route.value])

// ---- ログイン状態 ----
// 偽データモードではログイン不要。本物モードでは Supabase のセッションが無ければログイン画面を出す
const user = ref(null)
const ready = ref(IS_MOCK)     // セッション確認が終わるまで画面を出さない
const problem = configProblem()

onMounted(async () => {
  if (IS_MOCK || !supabase) { ready.value = true; return }
  const { data } = await supabase.auth.getSession()
  user.value = data.session?.user ?? null
  supabase.auth.onAuthStateChange((_event, session) => { user.value = session?.user ?? null })
  ready.value = true
})

async function logout() {
  if (supabase) await supabase.auth.signOut()
}
</script>

<template>
  <header class="topbar">
    <span class="title">KANSEITO</span>
    <nav>
      <a v-for="(p, path) in pages" :key="path" :href="'#' + path" :class="{ active: route === path }">{{ p.title }}</a>
    </nav>
    <span class="spacer"></span>
    <span class="who" v-if="user">{{ user.email }}</span>
    <button v-if="user" @click="logout">ログアウト</button>
  </header>

  <!-- 偽データモードの目印。本物と間違えないよう、必ず出す -->
  <div class="mockbar" v-if="IS_MOCK">偽データモード(VITE_MOCK=1)。Supabase には繋いでいません。数字は見本です。</div>

  <main class="page">
    <div class="error" v-if="problem">{{ problem }}</div>
    <template v-else-if="ready">
      <Login v-if="!IS_MOCK && !user" />
      <component v-else :is="page.comp" />
    </template>
    <p v-else class="foot">ログイン状態を確認しています…</p>
  </main>
</template>
