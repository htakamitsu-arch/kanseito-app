// ============================================================================
// 画面が使うデータの取り口。画面(pages/*.vue)は Supabase の表の名前を知らなくてよい。
//
//   loadNowStatus()      … 画面①「今の状態」用。9台ぶんの { machine, latest } を返す
//   loadReportDates()    … 画面②「日報」用。日報のある業務日を新しい順に返す
//   loadDailyReport(day) … 画面②「日報」用。その業務日の行(機械ぶん + 全社)を返す
//   loadCardDates()      … 画面③「カルテ」用。カルテのある日を新しい順に返す
//   loadCards(day)       … 画面③「カルテ」用。その日の9台ぶん(1台24コマ)を返す
//   loadOffSince(rows)   … 画面①用。電源OFF の機械が「いつから OFF か」(readings の最後に OFF 以外だった行の時刻)。2026-09-18 ①②試作
//   loadEnvironment()    … 画面①の帯用。工場の温湿度(いま + 今日の最高最低)。無ければ null
//   sendFeedback(f)      … 画面③「実際は?」用。1コマぶんの答えを1行送る(2026-09-14 W5)
//   loadFeedbackMarks(day)… 画面③用。その日の「答え済みのコマ」を返す(印を出すため)
//   recordPageView(page) … 画面を開いた記録を1行送る。失敗しても何も投げない(画面は必ず出す)
//
// 偽データモードでは src/mock/*.json を返し、本物モードでは Supabase を読む。
// 本物モードで読む表とビュー(差分案_鍵とRLS_2026-09-09.md で作るもの):
//   machines           … 機械の名前・表示名・LOW(low_a)
//   v_latest_readings  … 機械ごとの最新1行(readings から distinct on で作ったビュー)
//   daily_reports      … 日報(GAS の「日報」タブ17列を GAS が写す。差分案_画面2日報_2026-09-09.md)
//   machine_cards      … カルテ(GAS の「機械カルテ」タブを GAS が写す。7時〜翌6時の24コマ)
//   feedback           … 「実際は?」の答え(画面から insert。実際は_と_閲覧_2026-09-14.sql)
//   page_views         … 画面を開いた記録(画面から insert。同上)
//   tenant_users       … 自分がどの会社か(tenant_id を1つ取るためだけに読む)
// 偽データモードでは feedback と page_views をブラウザの localStorage に貯める(Supabase に送らない)。
// ============================================================================
import { supabase, IS_MOCK } from './supabase.js'
import { stateOf } from './status.js'
import mockMachines from '../mock/machines.json'
import mockLatest from '../mock/readings_latest.json'
import mockDaily from '../mock/daily_reports.json'
import mockCards from '../mock/machine_cards.json'
import mockEnv from '../mock/environment.json'

// 画面①: 機械ごとに「機械情報 + 最新の測定1行」を並べて返す
export async function loadNowStatus() {
  if (IS_MOCK) return mockNowStatus()

  // 本物: 2つの表を読んで、machine_id で突き合わせる
  // show_on_screen = 「現場向け画面①に出すか」の旗(2026-09-19 差分案_画面_データなしを無くす)。
  //   false の機械(例: 2号機の実験係 shizuoka。同じ静岡を 3号機 ch1 が公式に測っている)は一覧から外す。
  //   ★この列は Supabase に先に足してから公開する(無い列を読むと「machines を読めません」になる)
  const [m, r] = await Promise.all([
    supabase.from('machines').select('id, name, label, low_a, high_a, show_on_screen').order('name'),
    supabase.from('v_latest_readings').select('machine_id, measured_at, received_at, fw_state, avg_a, max_a, sigma'),
  ])
  if (m.error) throw new Error('machines を読めません: ' + m.error.message)
  if (r.error) throw new Error('v_latest_readings を読めません: ' + r.error.message)

  const latestOf = new Map((r.data || []).map(x => [x.machine_id, x]))
  return (m.data || []).filter(isShown).map(machine => ({
    machine,
    latest: latestOf.get(machine.id) || null,   // 直近31日に1行も無い機械は null(画面は「無通信」として出す)
  }))
}

// 画面①に出す機械か。旗が false のときだけ外す(旗が無い・null は「出す」= 新しい機械を黙って隠さない)
function isShown(machine) { return machine.show_on_screen !== false }

// 電源OFF の機械について「いつから OFF か」を返す。{ machine_id: iso } 。
// 本物: readings から「最後に POWER_OFF 以外だった行」を 1 行ずつ引く(9/9 の RLS で直近 31 日は読める)。
// 見つからなければその機械は入れない(画面は「最終データ N分前」で代用する)。読めなくても投げない。
export async function loadOffSince(rows) {
  const out = {}
  // 対象 = ファームが POWER_OFF の機械 + LOW 未満で電源OFF 扱いの機械(画面の色と同じ決まり)
  const offs = rows.filter(r => r.latest && stateOf(r.machine, r.latest).cls === 'off')
  if (IS_MOCK) {
    const now = Date.now()
    for (const r of offs) {
      const m = mockLatest.find(x => x.machine_id === r.machine.id)
      if (m && m.off_since_minutes_ago != null) out[r.machine.id] = new Date(now - m.off_since_minutes_ago * 60000).toISOString()
    }
    return out
  }
  await Promise.all(offs.map(async r => {
    try {
      // 「最後に OFF でなかった行」= ファームが POWER_OFF でなく、かつ LOW 以上(LOW があれば)の最新 1 行
      let q = supabase.from('readings').select('measured_at').eq('machine_id', r.machine.id).neq('fw_state', 'POWER_OFF')
      if (r.machine.low_a !== null && r.machine.low_a !== undefined) q = q.gte('avg_a', r.machine.low_a)
      const { data } = await q.order('measured_at', { ascending: false }).limit(1)
      if (data && data[0]) out[r.machine.id] = data[0].measured_at
    } catch (e) { /* 読めなければ出さないだけ */ }
  }))
  return out
}

// 偽データ: JSON の minutes_ago(何分前か)を「今」から引いて、本物と同じ形にする。
// こうしておくと、何日たっても偽データの「N分前」が現実的な数字で出る。
function mockNowStatus() {
  const now = Date.now()
  const latestOf = new Map()
  for (const row of mockLatest) {
    if (row.minutes_ago === null || row.minutes_ago === undefined) continue  // 受信なしの機械
    const measured = new Date(now - row.minutes_ago * 60000)
    latestOf.set(row.machine_id, {
      machine_id: row.machine_id,
      measured_at: measured.toISOString(),
      received_at: new Date(measured.getTime() + 65000).toISOString(),
      fw_state: row.fw_state,
      avg_a: row.avg_a,
      max_a: row.max_a,
      sigma: row.sigma,
    })
  }
  return mockMachines.filter(isShown).map(machine => ({ machine, latest: latestOf.get(machine.id) || null }))
}

// ---------------------------------------------------------------- 画面②「日報」

// 日報のある業務日を新しい順に返す(例: ['2026-09-08','2026-09-07', …])。最大30日
export async function loadReportDates() {
  if (IS_MOCK) return [...new Set(mockDaily.map(r => r.report_date))].sort().reverse()

  const { data, error } = await supabase
    .from('daily_reports')
    .select('report_date')
    .order('report_date', { ascending: false })
    .limit(400)                       // 30日 × 10行 では足りない日があってもよいように多めに取る
  if (error) throw new Error('daily_reports を読めません: ' + error.message)
  return [...new Set((data || []).map(r => r.report_date))].slice(0, 30)
}

// その業務日の行を返す。機械の行が先(名前順)、「全社(中央値)」の行が最後
export async function loadDailyReport(day) {
  let rows
  if (IS_MOCK) {
    rows = mockDaily.filter(r => r.report_date === day)
  } else {
    const { data, error } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('report_date', day)
    if (error) throw new Error('daily_reports を読めません: ' + error.message)
    rows = data || []
  }
  return rows.slice().sort(sortReportRows)
}

// 「全社」で始まる行は最後。それ以外は機械の名前順(日報タブと同じ見え方にする)
function sortReportRows(a, b) {
  const ga = a.machine_name.startsWith('全社') ? 1 : 0
  const gb = b.machine_name.startsWith('全社') ? 1 : 0
  if (ga !== gb) return ga - gb
  return a.machine_name.localeCompare(b.machine_name)
}

// ---------------------------------------------------------------- 画面③「カルテ」

// カルテのある日を新しい順に返す(最大60日)
export async function loadCardDates() {
  if (IS_MOCK) return [...new Set(mockCards.map(r => r.card_date))].sort().reverse()

  const { data, error } = await supabase
    .from('machine_cards')
    .select('card_date')
    .order('card_date', { ascending: false })
    .limit(800)
  if (error) throw new Error('machine_cards を読めません: ' + error.message)
  return [...new Set((data || []).map(r => r.card_date))].slice(0, 60)
}

// その日のカルテを機械の名前順で返す(1行 = 1台・24コマ)
export async function loadCards(day) {
  let rows
  if (IS_MOCK) {
    rows = mockCards.filter(r => r.card_date === day)
  } else {
    const { data, error } = await supabase
      .from('machine_cards')
      .select('*')
      .eq('card_date', day)
    if (error) throw new Error('machine_cards を読めません: ' + error.message)
    rows = data || []
  }
  return rows.slice().sort((a, b) => a.machine_name.localeCompare(b.machine_name))
}

// -------------------------------------------------- 画面①の帯「工場の環境」

// 温湿度センサー(SHT31)はユニットに1個しか付いていない。2026-09-10 の実測では
// 3号機の盤だけが持っていて、その盤が見ている4台(zv5400 / shizuoka2 / mb46 / kensaku)に
// 同じ値が配られている。だから「機械ごとの温度」ではなく「工場の1か所の温度」として出す。
// 5号機(okk / mu4000v)・4号機(dnm650 / u32k)は7日で0件 = センサーなし。
//
// 返すもの: { measured_at, temp_c, hum_pct, today_min_c, today_max_c, machine_names } / 無ければ null
// 業務日は日報・カルテと同じ「7時始まり」。7時前に見たときは前日7時からを「今日」とする。
export async function loadEnvironment() {
  if (IS_MOCK) return mockEnvironment()

  // ① いちばん新しい「温度が入っている行」。どの機械かはここで決まる(機械を決め打ちしない)
  const latest = await supabase
    .from('readings')
    .select('machine_id, measured_at, temp_c, hum_pct')
    .not('temp_c', 'is', null)
    .order('measured_at', { ascending: false })
    .limit(1)
  if (latest.error) throw new Error('温湿度を読めません: ' + latest.error.message)
  const row = (latest.data || [])[0]
  if (!row) return null                       // センサーが1台も無い / まだ届いていない

  // ② 今日(業務日)の最高と最低。1日ぶんを全部持ってこないで、並べ替えて1行ずつ取る
  const from = businessDayStartISO()
  const pick = (asc) => supabase
    .from('readings')
    .select('temp_c')
    .eq('machine_id', row.machine_id)
    .gte('measured_at', from)
    .not('temp_c', 'is', null)
    .order('temp_c', { ascending: asc })
    .limit(1)
  const [lo, hi] = await Promise.all([pick(true), pick(false)])

  // ③ 同じ盤に相乗りしている機械の表示名(どこを測っているかを画面に出すため)。
  //    カードと同じ日本語の名前にそろえる(label が無いときだけファームの名前)
  const mates = await supabase
    .from('readings')
    .select('machine_id')
    .gte('measured_at', new Date(new Date(row.measured_at).getTime() - 5 * 60000).toISOString())
    .not('temp_c', 'is', null)
  const ids = [...new Set((mates.data || []).map(x => x.machine_id))]
  let names = []
  if (ids.length) {
    const m = await supabase.from('machines').select('name, label').in('id', ids).order('name')
    names = (m.data || []).map(x => x.label || x.name)
  }

  return {
    measured_at: row.measured_at,
    temp_c: row.temp_c,
    hum_pct: row.hum_pct,
    today_min_c: lo.error ? null : (lo.data || [])[0]?.temp_c ?? null,
    today_max_c: hi.error ? null : (hi.data || [])[0]?.temp_c ?? null,
    machine_names: names,
  }
}

// 業務日(7時始まり)の開始時刻を ISO で返す。7時前なら前日の7時
function businessDayStartISO() {
  const d = new Date()
  if (d.getHours() < 7) d.setDate(d.getDate() - 1)
  d.setHours(7, 0, 0, 0)
  return d.toISOString()
}

function mockEnvironment() {
  return {
    measured_at: new Date(Date.now() - mockEnv.minutes_ago * 60000).toISOString(),
    temp_c: mockEnv.temp_c,
    hum_pct: mockEnv.hum_pct,
    today_min_c: mockEnv.today_min_c,
    today_max_c: mockEnv.today_max_c,
    machine_names: mockEnv.machine_names,
  }
}

// ---------------------------------------------------------------- 画面③「実際は?」(W5・2026-09-14)

// 5択。画面もこの並びで出す。ここ以外の言葉は送らない(SQL の check と同じ並び)
export const ACTUAL_CHOICES = ['加工', '段取り', '暖機', '電源OFF', '分からない']

// 偽データモードの置き場(ブラウザの localStorage の鍵)。本物には一切送らない
const LS_FEEDBACK = 'kanseito_mock_feedback'
const LS_VIEWS    = 'kanseito_mock_page_views'

// 1コマぶんの答えを1行送る。
//   f = { machine_name, card_date, hour, shown_state, actual_state }
//     hour        = そのコマの時刻(7〜23, 0〜6)。card_date と hour でコマが1つに決まる
//     shown_state = 画面がそのコマに出していた判定('加工' など。未記入は '')
//     actual_state= 押された5択のどれか
// 送れなかったら例外を投げる(画面は「送れませんでした」と出す。黙って失敗しない)
export async function sendFeedback(f) {
  if (!ACTUAL_CHOICES.includes(f.actual_state)) throw new Error('5択にない答えです: ' + f.actual_state)
  const row = {
    machine_name: f.machine_name,
    card_date:    f.card_date,
    hour:         f.hour,
    shown_state:  f.shown_state || null,
    actual_state: f.actual_state,
  }
  if (IS_MOCK) {
    const all = lsRead(LS_FEEDBACK)
    all.push({ ...row, user_email: 'mock@example', created_at: new Date().toISOString() })
    lsWrite(LS_FEEDBACK, all)
    return
  }
  const who = await whoAmI()
  const { error } = await supabase.from('feedback').insert({ ...row, tenant_id: who.tenant_id, user_email: who.email })
  if (error) throw new Error('feedback に書けません: ' + error.message)
}

// その日の答え済みのコマを返す。{ 'mb46|10': '段取り', … }(同じコマに何度も答えたら最後の答え)
// 読めなかったら空を返す(印が出ないだけ。カルテ本体は必ず出す)
export async function loadFeedbackMarks(day) {
  let rows = []
  try {
    if (IS_MOCK) {
      rows = lsRead(LS_FEEDBACK).filter(r => r.card_date === day)
    } else {
      const { data, error } = await supabase
        .from('feedback')
        .select('machine_name, hour, actual_state, created_at')
        .eq('card_date', day)
        .order('created_at', { ascending: true })
      if (error) throw error
      rows = data || []
    }
  } catch (e) {
    console.warn('feedback を読めませんでした(印は出しません):', e.message || e)
    return {}
  }
  const marks = {}
  for (const r of rows) marks[r.machine_name + '|' + r.hour] = r.actual_state   // 後の行が前の行を上書き = 最後の答え
  return marks
}

// ---------------------------------------------------------------- 閲覧回数(W5・2026-09-14)

// 画面を開いた記録を1行送る(page = '/now' / '/daily' / '/karte')。
// ★何があっても例外を投げない・待たなくてよい。App.vue は結果を見ずに画面を出す
export async function recordPageView(page) {
  try {
    if (IS_MOCK) {
      const all = lsRead(LS_VIEWS)
      all.push({ page, user_email: 'mock@example', created_at: new Date().toISOString() })
      lsWrite(LS_VIEWS, all.slice(-500))   // 偽データは最新500件だけ残す(localStorage を太らせない)
      return
    }
    if (!supabase) return
    const who = await whoAmI()
    const { error } = await supabase.from('page_views').insert({ page, tenant_id: who.tenant_id, user_email: who.email })
    if (error) console.warn('page_views に書けませんでした(画面には影響なし):', error.message)
  } catch (e) {
    console.warn('page_views に書けませんでした(画面には影響なし):', e.message || e)
  }
}

// ---------------------------------------------------------------- 内部で使う小さな部品

// 「自分は誰で、どの会社か」。tenant_users の自分の行(RLS「自分の行だけ」)から tenant_id を1回だけ取り、以後は覚えておく
let _who = null
async function whoAmI() {
  if (_who) return _who
  const { data: s } = await supabase.auth.getSession()
  const u = s?.session?.user
  if (!u) throw new Error('ログインしていません')
  const { data, error } = await supabase.from('tenant_users').select('tenant_id').limit(1)
  if (error) throw new Error('tenant_users を読めません: ' + error.message)
  const t = (data || [])[0]?.tenant_id
  if (!t) throw new Error('tenant_users に自分の行がありません(会社が決まっていない)')
  _who = { user_id: u.id, email: u.email || '', tenant_id: t }
  return _who
}

// localStorage の読み書き(偽データモード専用)。壊れていても画面を止めない
function lsRead(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}
function lsWrite(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)) } catch (e) { console.warn('localStorage に書けません:', e.message || e) }
}
