// ============================================================================
// 画面が使うデータの取り口。画面(pages/*.vue)は Supabase の表の名前を知らなくてよい。
//
//   loadNowStatus()      … 画面①「今の状態」用。9台ぶんの { machine, latest } を返す
//   loadReportDates()    … 画面②「日報」用。日報のある業務日を新しい順に返す
//   loadDailyReport(day) … 画面②「日報」用。その業務日の行(機械ぶん + 全社)を返す
//   loadCardDates()      … 画面③「カルテ」用。カルテのある日を新しい順に返す
//   loadCards(day)       … 画面③「カルテ」用。その日の9台ぶん(1台24コマ)を返す
//   loadEnvironment()    … 画面①の帯用。工場の温湿度(いま + 今日の最高最低)。無ければ null
//
// 偽データモードでは src/mock/*.json を返し、本物モードでは Supabase を読む。
// 本物モードで読む表とビュー(差分案_鍵とRLS_2026-09-09.md で作るもの):
//   machines           … 機械の名前・表示名・LOW(low_a)
//   v_latest_readings  … 機械ごとの最新1行(readings から distinct on で作ったビュー)
//   daily_reports      … 日報(GAS の「日報」タブ17列を GAS が写す。差分案_画面2日報_2026-09-09.md)
//   machine_cards      … カルテ(GAS の「機械カルテ」タブを GAS が写す。7時〜翌6時の24コマ)
// ============================================================================
import { supabase, IS_MOCK } from './supabase.js'
import mockMachines from '../mock/machines.json'
import mockLatest from '../mock/readings_latest.json'
import mockDaily from '../mock/daily_reports.json'
import mockCards from '../mock/machine_cards.json'
import mockEnv from '../mock/environment.json'

// 画面①: 機械ごとに「機械情報 + 最新の測定1行」を並べて返す
export async function loadNowStatus() {
  if (IS_MOCK) return mockNowStatus()

  // 本物: 2つの表を読んで、machine_id で突き合わせる
  const [m, r] = await Promise.all([
    supabase.from('machines').select('id, name, label, low_a, high_a').order('name'),
    supabase.from('v_latest_readings').select('machine_id, measured_at, received_at, fw_state, avg_a, max_a, sigma'),
  ])
  if (m.error) throw new Error('machines を読めません: ' + m.error.message)
  if (r.error) throw new Error('v_latest_readings を読めません: ' + r.error.message)

  const latestOf = new Map((r.data || []).map(x => [x.machine_id, x]))
  return (m.data || []).map(machine => ({
    machine,
    latest: latestOf.get(machine.id) || null,   // まだ1行も無い機械は null
  }))
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
  return mockMachines.map(machine => ({ machine, latest: latestOf.get(machine.id) || null }))
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

  // ③ 同じ盤に相乗りしている機械の名前(どこを測っているかを画面に出すため)
  const mates = await supabase
    .from('readings')
    .select('machine_id')
    .gte('measured_at', new Date(new Date(row.measured_at).getTime() - 5 * 60000).toISOString())
    .not('temp_c', 'is', null)
  const ids = [...new Set((mates.data || []).map(x => x.machine_id))]
  let names = []
  if (ids.length) {
    const m = await supabase.from('machines').select('name').in('id', ids).order('name')
    names = (m.data || []).map(x => x.name)
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
