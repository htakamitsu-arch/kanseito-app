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
import { loadNowStatus, loadEnvironment, loadOffSince } from '../lib/data.js'
import { stateOf, isStale, isUndecidable, agoText, ampText, clockText, sinceText, checkList, STALE_MIN } from '../lib/status.js'

const rows = ref([])          // [{ machine, latest }]
const env = ref(null)         // 工場の温湿度(センサーが無ければ null のまま)
const offSince = ref({})      // 電源OFF の機械が「いつから OFF か」{ machine_id: iso }(2026-09-18 ①②試作)
const error = ref('')
const updatedAt = ref(null)   // この画面が最後に読み直した時刻
const now = ref(Date.now())   // 「N分前」の計算に使う現在時刻(1分ごとに進める)

async function reload() {
  try {
    rows.value = await loadNowStatus()
    // 温湿度は「あれば出す」おまけ。読めなくても機械の一覧は必ず出す
    try { env.value = await loadEnvironment() } catch (e) { env.value = null }
    try { offSince.value = await loadOffSince(rows.value) } catch (e) { offSince.value = {} }
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

// ①「いま確認すること」(無通信・判定不能だけ。開始が古い順)
function checks() { return checkList(rows.value, now.value) }
// データなしの機械(GAS 直送など、この画面に届く仕組みが無い)。要確認には数えない
function noData() { return rows.value.filter(r => !r.latest) }
function kindText(k) { return k === 'stale' ? '無通信' : '判定不能' }
</script>

<template>
  <h2>
    今の状態
    <span v-if="updatedAt">(画面の更新 {{ clockText(updatedAt.toISOString()) }})</span>
    <span v-if="staleCount() > 0" style="color: var(--alert); font-weight: 700"> — 無通信 {{ staleCount() }}台</span>
  </h2>

  <div class="error" v-if="error">読めませんでした: {{ error }}</div>

  <!-- ①「いま確認すること」(2026-09-18 試作)。無通信と判定不能だけ。電源OFF は普通の状態なので出さない。
       0 台のときも必ず 1 行出す(空欄だと「黙って失敗」と区別がつかない) -->
  <div class="check" :class="{ none: checks().length === 0 }" v-if="!error && rows.length">
    <div class="check-h">いま確認すること<span v-if="checks().length"> {{ checks().length }}件</span></div>
    <div v-if="checks().length === 0" class="check-ok">ありません — 届いている機械はすべて状態が読めています</div>
    <div v-for="c in checks()" :key="c.machine.id" class="check-row" :class="c.kind">
      <span class="check-name">{{ c.machine.label || c.machine.name }}</span>
      <span class="check-kind">{{ kindText(c.kind) }}</span>
      <span class="check-since">{{ sinceText(c.since, now) }}</span>
    </div>
    <div v-for="r in noData()" :key="r.machine.id" class="check-note">
      {{ r.machine.label || r.machine.name }}: データなし。この画面に届く仕組みがありません(GAS 直送)。異常ではありません
    </div>
  </div>

  <!-- 工場の環境。センサーはユニットに1個なので、機械ごとではなく1か所として出す -->
  <div class="env" v-if="env">
    <div class="envmain">
      <span class="v">{{ Number(env.temp_c).toFixed(1) }}<small>℃</small></span>
      <span class="v">{{ Math.round(env.hum_pct) }}<small>%</small></span>
    </div>
    <div class="envsub">
      <span v-if="env.today_max_c !== null && env.today_min_c !== null">
        今日 最高 {{ Number(env.today_max_c).toFixed(1) }}℃ / 最低 {{ Number(env.today_min_c).toFixed(1) }}℃
      </span>
      <span>{{ agoText(env, now) }}({{ clockText(env.measured_at) }})</span>
    </div>
    <div class="envnote">
      測っているのは<b>工場の1か所だけ</b>です。温湿度センサーは盤に1個で、
      <template v-if="env.machine_names.length">{{ env.machine_names.join(' / ') }}</template>
      <template v-else>1つの盤</template>
      が同じ値を使っています。機械ごとの温度ではありません。
    </div>
  </div>

  <div class="grid">
    <div v-for="r in rows" :key="r.machine.id" class="card" :class="{ stale: isStale(r.latest, now) }">
      <div class="name">{{ r.machine.label || r.machine.name }}<span class="code">{{ r.machine.name }}</span></div>
      <div class="state" :class="stateOf(r.machine, r.latest).cls">{{ stateOf(r.machine, r.latest).text }}</div>
      <div class="amp">{{ ampText(r.latest) }}<small>A 平均</small></div>
      <!-- ② 文と時刻で区別する(2026-09-18 試作): 無通信 / 判定不能 / 電源OFF はいつから、データなしは理由 -->
      <div class="last">
        <template v-if="isStale(r.latest, now)">無通信 {{ sinceText(r.latest.measured_at, now) }}届いていません</template>
        <template v-else-if="isUndecidable(r.machine, r.latest)">判定不能 {{ sinceText(r.latest.measured_at, now) }}— 届いていますが状態が読めません</template>
        <template v-else-if="stateOf(r.machine, r.latest).cls === 'off' && offSince[r.machine.id]">電源OFF {{ sinceText(offSince[r.machine.id], now) }}</template>
        <template v-else-if="r.latest">最終データ {{ agoText(r.latest, now) }}({{ clockText(r.latest.measured_at) }})</template>
        <template v-else>データなし: この画面に届く仕組みがありません(GAS 直送)。異常ではありません</template>
      </div>
    </div>
  </div>

  <div class="foot">
    <div class="legend">
      <span style="background: var(--off); color: #fff">電源OFF</span>
      <span style="background: var(--low)">通電</span>
      <span style="background: var(--high); color: #fff">高負荷</span>
      <span style="background: var(--none)">判定不能 / データなし</span>
      <span style="border: 2px solid var(--alert)">赤枠 = {{ STALE_MIN }}分以上無通信</span>
    </div>
    色はファームの状態と LOW だけで決めています。「加工 / 段取り / 暖機」の判定は日報(②)とカルテ(③)で出します。
    60秒ごとに自動で読み直します。
  </div>
</template>
