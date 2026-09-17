<!-- ============================================================================
  画面②「日報」。前の業務日(朝5時〜翌朝5時)の 通電 / 加工 / 段取り / 暖機 を機械ごとに出す。

  数字はこの画面では一切作らない。GAS が「日報」タブに書いた17列を、GAS が Supabase の
  daily_reports 表へ写したものを、そのまま並べるだけ。
  (「数字は固定プログラム(GAS)で出す。AIは解釈だけ」2026-09-03 高満氏指示)

  日付は選べる(daily_reports にある業務日を新しい順に最大30日)。
  「全社(中央値)」の行は GAS が計算したものをそのまま最後に置く。この画面では計算しない。
============================================================================ -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { loadReportDates, loadDailyReport } from '../lib/data.js'

const days = ref([])          // 選べる業務日(新しい順)
const day = ref('')           // いま見ている業務日
const rows = ref([])          // その日の行(機械ぶん + 全社)
const error = ref('')
const loading = ref(true)

onMounted(async () => {
  try {
    days.value = await loadReportDates()
    if (days.value.length > 0) {
      day.value = days.value[0]
      rows.value = await loadDailyReport(day.value)
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
    rows.value = await loadDailyReport(d)
    error.value = ''
  } catch (e) {
    error.value = String(e.message || e)
  }
  loading.value = false
}

// 備考のある機械だけ、表の下に並べる(表の中に入れると横に長くなりすぎるため)。
// 全社(中央値)の備考は「中央値にした理由」の説明文なので、機械の注意書きとは分ける
const notes = computed(() => rows.value.filter(r => hasNote(r)))
function hasNote(r) { return !!r.note && !isTotal(r) }

// 空欄は「−」。0 と「値なし」を混ぜない
function n(v, digits = 1) {
  if (v === null || v === undefined || v === '') return '−'
  return Number(v).toFixed(digits)
}
function pct(v) { return (v === null || v === undefined || v === '') ? '−' : Math.round(v) + '%' }
// 暖機は時間(h)で届くが、画面では分で出す(高満氏 2026-09-17 指示)
function mins(v) { return (v === null || v === undefined || v === '') ? '−' : Math.round(v * 60) }
function diff(v) {
  if (v === null || v === undefined || v === '') return '−'
  const x = Number(v)
  return (x > 0 ? '+' : '') + x.toFixed(1)
}
function isTotal(r) { return r.machine_name.startsWith('全社') }
function writtenText(r) {
  if (!r || !r.written_at) return ''
  const d = new Date(r.written_at)
  return d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <h2>
    日報
    <span v-if="day">(業務日 {{ day }} 朝5時〜翌朝5時)</span>
    <span v-if="rows.length" style="margin-left: 8px">GAS が書いた時刻 {{ writtenText(rows[0]) }}</span>
  </h2>

  <div class="error" v-if="error">読めませんでした: {{ error }}</div>

  <!-- 日付えらび。押した日の表に入れ替わる -->
  <div class="daypick" v-if="days.length">
    <button v-for="d in days.slice(0, 14)" :key="d" :class="{ on: d === day }" @click="pick(d)">
      {{ d.slice(5).replace('-', '/') }}
    </button>
  </div>

  <div class="placeholder" v-if="!loading && !error && rows.length === 0">
    まだ日報が Supabase に届いていません。<br />
    数字は毎朝 5:30 に GAS がスプレッドシートの「日報」タブへ書き、5:45 に Supabase へ送ります。<br />
    その送信(GAS 1ファイル + Supabase の関数1本)は
    <code>差分案_画面2日報_2026-09-09.md</code> の承認後に入ります。
  </div>

  <div class="tablewrap" v-if="rows.length">
    <table class="report">
      <thead>
        <tr>
          <th class="left">機械</th>
          <th>通電<small>h</small></th>
          <th>加工<small>h</small></th>
          <th>加工率</th>
          <th>段取り<small>h</small></th>
          <th>暖機<small>分</small></th>
          <th>加工 前日比<small>h</small></th>
          <th>記録<small>件</small></th>
          <th>記録<small>h</small></th>
          <th>記録÷加工</th>
          <th>測定できた率</th>
          <th class="left">判定方式</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.machine_name" :class="{ total: isTotal(r) }">
          <td class="left name">{{ r.machine_name }}<span v-if="hasNote(r)" class="mark">★</span></td>
          <td>{{ n(r.on_h) }}</td>
          <td class="strong">{{ n(r.cut_h) }}</td>
          <td>
            <div class="bar"><i :style="{ width: Math.min(100, r.cut_pct || 0) + '%' }"></i></div>
            <span class="barnum">{{ pct(r.cut_pct) }}</span>
          </td>
          <td>{{ n(r.setup_h) }}</td>
          <td>{{ mins(r.warmup_h) }}</td>
          <td :class="{ up: r.cut_diff_h > 0, down: r.cut_diff_h < 0 }">{{ diff(r.cut_diff_h) }}</td>
          <td>{{ r.rec_count === null || r.rec_count === undefined ? '−' : r.rec_count }}</td>
          <td>{{ n(r.rec_h) }}</td>
          <td>{{ pct(r.rec_over_cut_pct) }}</td>
          <td :class="{ warn: r.measured_pct !== null && r.measured_pct < 90 }">{{ pct(r.measured_pct) }}</td>
          <td class="left small">{{ r.method }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="foot" v-if="rows.length">
    <div v-for="r in notes" :key="'n' + r.machine_name" class="notline">
      <b>{{ r.machine_name }}</b>: {{ r.note }}
    </div>
    通電 = 電源が入っていた時間。加工 + 段取り + 暖機 = 通電(重ならないように数えています。暖機だけ分で出しています)。<br />
    加工 前日比 は「前の業務日の加工(h)」との差。記録÷加工 は現場の加工記録(9/8 の週で入力停止)との比。<br />
    全社の行は各機械の中央値です(合計は通電の長い機械に引っ張られるため)。★のついた機械には備考があります(すぐ上に出しています)。
  </div>
</template>
