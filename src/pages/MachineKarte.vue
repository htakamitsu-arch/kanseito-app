<!-- ============================================================================
  画面③「カルテ」。案A(2026-09-09 高満氏が選択): 1日ぶんを9台ならべる横の帯。

  1台1行。7時から翌6時までの24コマを、色の帯で出す。
    加工 = 青 / 段取り = 黄 / 暖機 = 橙 / 電源OFF = 灰 / 未記入 = 白
  右に 段取り(h)・暖機(分)・前日比(h)。人が書いた「気づき・メモ」は帯の下に出す。

  この画面では状態も数字も作らない。GAS が「機械カルテ」タブに書いたものを、
  GAS が Supabase の machine_cards 表へ写したものを、そのまま並べるだけ。

  ★カルテは 7時始まり・翌6時終わり。日報(画面②)の業務日は 5時始まりで、1〜2時間ずれる。
    同じ日でも数字が一致しないことがある。画面にもその旨を出す。

  「実際は?」(2026-09-14・W5):
    コマを押すと「機械はこう言っています。実際は?」の5択が出る。1つ押すと1行送って閉じる。
    見せ方は「あなたの作業を記録する」ではなく「機械の言い分が合っているか教えてください」。
    答えたコマには小さな印(答えの1文字)を出す。表の名前はこの画面は知らない(lib/data.js だけ)。
============================================================================ -->
<script setup>
import { ref, computed, onMounted } from 'vue'
import { loadCardDates, loadCards, loadFeedbackMarks, sendFeedback, ACTUAL_CHOICES } from '../lib/data.js'

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
      marks.value = await loadFeedbackMarks(day.value)   // 読めなくても {} が返る(印が無いだけ)
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
    marks.value = await loadFeedbackMarks(d)
    error.value = ''
  } catch (e) {
    error.value = String(e.message || e)
  }
  loading.value = false
}

// ---- 「実際は?」の5択 ----
const marks = ref({})          // { 'mb46|10': '段取り' } 答え済みのコマ(最後の答え)
const asking = ref(null)       // いま5択を出しているコマ { machine_name, hour, shown_state } / 出していないときは null
const sending = ref(false)     // 送信中(二重押し防止)
const sendError = ref('')      // 送れなかったときの文
const thanks = ref('')         // 送れたあとに一瞬出す文

// コマを押した → 5択を出す(1タップ目)
function ask(r, i) {
  if (sending.value) return
  sendError.value = ''
  asking.value = { machine_name: r.machine_name, hour: hours[i], shown_state: r.states[i] || '' }
}
function closeAsk() { if (!sending.value) asking.value = null }

// 5択のどれかを押した → 1行送って閉じる(2タップ目。これで終わり)
async function answer(actual) {
  if (!asking.value || sending.value) return
  const a = asking.value
  sending.value = true
  sendError.value = ''
  try {
    await sendFeedback({ machine_name: a.machine_name, card_date: day.value, hour: a.hour, shown_state: a.shown_state, actual_state: actual })
    marks.value = { ...marks.value, [a.machine_name + '|' + a.hour]: actual }   // すぐ印を出す(読み直しは待たない)
    asking.value = null
    thanks.value = a.machine_name + ' ' + a.hour + '時 →「' + actual + '」を受け取りました。ありがとうございます'
    setTimeout(() => { thanks.value = '' }, 4000)
  } catch (e) {
    sendError.value = '送れませんでした: ' + String(e.message || e) + '(もう一度押すか、あとで試してください)'
  }
  sending.value = false
}

// 答え済みのコマに出す印(答えの1文字)。'分からない' は '?'
function mark(r, i) {
  const m = marks.value[r.machine_name + '|' + hours[i]]
  if (!m) return ''
  return m === '分からない' ? '?' : m.charAt(0)
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

  <!-- 「実際は?」を送れたあとに4秒だけ出す(表の上。スクロールしなくても見える) -->
  <div class="thanks" v-if="thanks">{{ thanks }}</div>

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
            <!-- コマは押せる(1タップ目)。押すと下に「実際は?」の5択が出る -->
            <button type="button" class="blk" :class="[cls(s), { marked: mark(r, i) }]"
                    :title="hours[i] + '時 ' + (s || '未記入') + ' — 押すと「実際は?」を聞きます'"
                    :aria-label="r.machine_name + ' ' + hours[i] + '時 ' + (s || '未記入')"
                    @click="ask(r, i)">
              <span v-if="mark(r, i)" class="fb-mark">{{ mark(r, i) }}</span>
            </button>
          </td>
          <td class="num strong">{{ cutHours(r) }}<small>h</small></td>
          <td class="num">{{ n(r.setup_h) }}<small>h</small></td>
          <td class="num">{{ r.warmup_min === null || r.warmup_min === undefined ? '−' : r.warmup_min }}<small>分</small></td>
          <td class="num" :class="{ up: r.diff_h > 0, down: r.diff_h < 0 }">{{ diff(r.diff_h) }}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- 「実際は?」の5択。コマを押すと出る。1つ押せば送って閉じる(全部で2タップ) -->
  <div class="fb-back" v-if="asking" @click.self="closeAsk">
    <div class="fb-sheet" role="dialog" aria-label="実際は?">
      <div class="fb-head">
        <b>{{ asking.machine_name }}</b> の <b>{{ asking.hour }}時</b>台<br />
        機械は「<b>{{ asking.shown_state || '未記入' }}</b>」と言っています。合っていますか?
      </div>
      <div class="fb-q">実際は:</div>
      <div class="fb-choices">
        <button v-for="c in ACTUAL_CHOICES" :key="c" type="button" class="fb-choice" :class="cls(c)"
                :disabled="sending" @click="answer(c)">{{ c }}</button>
      </div>
      <div class="error" v-if="sendError">{{ sendError }}</div>
      <button type="button" class="fb-cancel" :disabled="sending" @click="closeAsk">やめる</button>
      <div class="fb-note">これは作業の記録ではありません。機械の言い分が合っているかを教えてもらい、判定を良くするために使います。</div>
    </div>
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
    帯の1コマが1時間です。左が朝7時、右端が翌朝6時。<b>コマを押すと「実際は?」を聞きます</b>(2回押せば終わり)。答えたコマには1文字の印が付きます。<br />
    「加工」の数字は、その日 加工だったコマの数です。時間の合計ではありません。<br />
    <b>カルテは7時始まり、日報(②)は5時始まり</b>です。同じ日でも数字が一致しないことがあります。<br />
    9/7 以前は判定の物差しが古い版のままです(9/8 から v2.3段2)。古い日の暖機はそのまま比べられません。
  </div>
</template>
