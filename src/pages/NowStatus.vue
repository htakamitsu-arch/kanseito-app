<!-- ============================================================================
  画面①「今の状態」。9台のカード。
    ・機械名(表示名 + ファームの名前)
    ・状態の色: 電源OFF(灰)/ 通電(黄)/ 高負荷(緑)/ データなし(薄灰)
        ← ファームの fw_state と LOW(machines.low_a)だけで決める。加工/段取りの判定はしない
    ・平均電流(A)
    ・最終データから何分たったか
    ・11分以上届いていなければ赤い枠(GAS の checkHeartbeat と同じ)

  データの取り方は lib/data.js、色の決まりは lib/status.js。この画面は「並べて出す」だけ。
  60秒ごとに読み直す(1分1行のデータなので、それより速くしても意味がない)。
============================================================================ -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { loadNowStatus } from '../lib/data.js'
import { stateOf, isStale, agoText, ampText, clockText, STALE_MIN } from '../lib/status.js'

const rows = ref([])          // [{ machine, latest }]
const error = ref('')
const updatedAt = ref(null)   // この画面が最後に読み直した時刻
const now = ref(Date.now())   // 「N分前」の計算に使う現在時刻(1分ごとに進める)

async function reload() {
  try {
    rows.value = await loadNowStatus()
    error.value = ''
    updatedAt.value = new Date()
  } catch (e) {
    error.value = String(e.message || e)   // 読めなかったことを隠さない
  }
  now.value = Date.now()
}

let timer = null
onMounted(() => { reload(); timer = setInterval(reload, 60 * 1000) })
onUnmounted(() => clearInterval(timer))

// 赤枠の台数(見出しに出す)
function staleCount() { return rows.value.filter(r => isStale(r.latest, now.value)).length }
</script>

<template>
  <h2>
    今の状態
    <span v-if="updatedAt">(画面の更新 {{ clockText(updatedAt.toISOString()) }})</span>
    <span v-if="staleCount() > 0" style="color: var(--alert); font-weight: 700"> — 無通信 {{ staleCount() }}台</span>
  </h2>

  <div class="error" v-if="error">読めませんでした: {{ error }}</div>

  <div class="grid">
    <div v-for="r in rows" :key="r.machine.id" class="card" :class="{ stale: isStale(r.latest, now) }">
      <div class="name">{{ r.machine.label || r.machine.name }}<span class="code">{{ r.machine.name }}</span></div>
      <div class="state" :class="stateOf(r.machine, r.latest).cls">{{ stateOf(r.machine, r.latest).text }}</div>
      <div class="amp">{{ ampText(r.latest) }}<small>A 平均</small></div>
      <div class="last">
        <template v-if="isStale(r.latest, now)">無通信 {{ agoText(r.latest, now) }}から届いていません</template>
        <template v-else-if="r.latest">最終データ {{ agoText(r.latest, now) }}({{ clockText(r.latest.measured_at) }})</template>
        <template v-else>まだ Supabase に1行も届いていません(GAS 直送の機械はここに出ません)</template>
      </div>
    </div>
  </div>

  <div class="foot">
    <div class="legend">
      <span style="background: var(--off); color: #fff">電源OFF</span>
      <span style="background: var(--low)">通電</span>
      <span style="background: var(--high); color: #fff">高負荷</span>
      <span style="background: var(--none)">データなし</span>
      <span style="border: 2px solid var(--alert)">赤枠 = {{ STALE_MIN }}分以上無通信</span>
    </div>
    色はファームの状態と LOW だけで決めています。「加工 / 段取り / 暖機」の判定は日報(②)とカルテ(③)で出します。
    60秒ごとに自動で読み直します。
  </div>
</template>
