<!-- ============================================================================
  画面③「カルテ」。案A(2026-09-09 高満氏が選択): 1日ぶんを9台ならべる横の帯。

  1台1行。7時から翌6時までの24コマを、色の帯で出す。
    加工 = 青 / 段取り = 黄 / 暖機 = 橙 / 電源OFF = 灰 / 未記入 = 白
  右に 段取り(h)・暖機(分)・前日比(h)。人が書いた「気づき・メモ」は帯の下に出す。

  この画面では状態も数字も作らない。GAS が「機械カルテ」タブに書いたものを、
  GAS が Supabase の machine_cards 表へ写したものを、そのまま並べるだけ。

  ★カルテは 7時始まり・翌6時終わり。日報(画面②)の業務日は 5時始まりで、1〜2時間ずれる。
    同じ日でも数字が一致しないことがある。画面にもその旨を出す。
============================================================================ -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { loadCardDates, loadCards } from '../lib/data.js'

const days = ref([])          // カルテのある日(新しい順)
const day = ref('')           // いま見ている日
const rows = ref([])          // その日の9台
const error = ref('')
const loading = ref(true)

// 24コマの見出し。7時から翌6時まで
const hours = Array.from({ length: 24 }, (_, i) => (i + 7) % 24)

onMounted(async () => {
  try {
    days.value = await loadCardDates()
    if (days.value.length > 0) {
      day.value = days.value[0]
      rows.value = await loadCards(day.value)
    }
  } catch (e) {
    error.value = String(e.message || e)   // 読めなかったことを隠さない
  }
  loading.value = false
})

async function pick(d) {
  loading.value = true
  day.value = d
  try {
    rows.value = await loadCards(d)
    error.value = ''
  } catch (e) {
    error.value = String(e.message || e)
  }
  loading.value = false
}

// 状態 → CSS のクラス名。知らない文字は「未記入」扱いにする(勝手に読み替えない)
function cls(s) {
  if (s === '加工') return 'k-cut'
  if (s === '段取り') return 'k-setup'
  if (s === '暖機') return 'k-warm'
  if (s === '電源OFF') return 'k-off'
  return 'k-none'
}

// メモのある機械だけ、帯の下に出す
const notes = computed(() => rows.value.filter(r => r.note))

function n(v, digits = 1) {
  if (v === null || v === undefined || v === '') return '−'
  return Number(v).toFixed(digits)
}
function diff(v) {
  if (v === null || v === undefined || v === '') return '−'
  const x = Number(v)
  return (x > 0 ? '+' : '') + x.toFixed(1)
}
// その日その機械の「加工だったコマ数」。帯の右に出す目安
function cutHours(r) { return (r.states || []).filter(s => s === '加工').length }
</script>

<template>
  <h2>
    カルテ
    <span v-if="day">({{ day }} 朝7時〜翌朝6時)</span>
  </h2>

  <div class="error" v-if="error">読めませんでした: {{ error }}</div>

  <!-- 日付えらび。押した日の帯に入れ替わる -->
  <div class="daypick" v-if="days.length">
    <button v-for="d in days" :key="d" :class="{ on: d === day }" @click="pick(d)">
      {{ d.slice(5).replace('-', '/') }}
    </button>
  </div>

  <div class="placeholder" v-if="!loading && !error && rows.length === 0">
    まだカルテが Supabase に届いていません。<br />
    毎朝6:00 に GAS がスプレッドシートの「機械カルテ」タブを送ります。<br />
    その送信(GAS 1ファイル + Supabase の表1つと関数1本)は
    <code>カルテ送信_2026-09-09.sql</code> と <code>送信_カルテ_20260909.gs</code> を入れると動きます。
  </div>

  <div class="tablewrap" v-if="rows.length">
    <table class="karte">
      <thead>
        <tr>
          <th class="left">機械</th>
          <th v-for="(h, i) in hours" :key="i" class="hcol">{{ h }}</th>
          <th>加工</th>
          <th>段取り</th>
          <th>暖機</th>
          <th>前日比</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.machine_name">
          <td class="left name">{{ r.machine_name }}<span v-if="r.note" class="mark">★</span></td>
          <td v-for="(s, i) in r.states" :key="i" class="cell">
            <div class="blk" :class="cls(s)" :title="hours[i] + '時 ' + (s || '未記入')"></div>
          </td>
          <td class="num strong">{{ cutHours(r) }}<small>h</small></td>
          <td class="num">{{ n(r.setup_h) }}<small>h</small></td>
          <td class="num">{{ r.warmup_min === null || r.warmup_min === undefined ? '−' : r.warmup_min }}<small>分</small></td>
          <td class="num" :class="{ up: r.diff_h > 0, down: r.diff_h < 0 }">{{ diff(r.diff_h) }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="foot" v-if="rows.length">
    <div class="legend">
      <span class="k-cut">加工</span>
      <span class="k-setup">段取り</span>
      <span class="k-warm">暖機</span>
      <span class="k-off">電源OFF</span>
      <span class="k-none">未記入</span>
    </div>
    <div v-for="r in notes" :key="'n' + r.machine_name" class="notline">
      <b>{{ r.machine_name }}</b>: {{ r.note }}
    </div>
    帯の1コマが1時間です。左が朝7時、右端が翌朝6時。マスに触れるとその時間が出ます。<br />
    「加工」の数字は、その日 加工だったコマの数です。時間の合計ではありません。<br />
    <b>カルテは7時始まり、日報(②)は5時始まり</b>です。同じ日でも数字が一致しないことがあります。<br />
    9/7 以前は判定の物差しが古い版のままです(9/8 から v2.3段2)。古い日の暖機はそのまま比べられません。
  </div>
</template>
