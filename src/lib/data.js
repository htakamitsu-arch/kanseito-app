// ============================================================================
// 画面が使うデータの取り口。画面(pages/*.vue)は Supabase の表の名前を知らなくてよい。
//
//   loadNowStatus()      … 画面①「今の状態」用。9台ぶんの { machine, latest } を返す
//   loadReportDates()    … 画面②「日報」用。日報のある業務日を新しい順に返す
//   loadDailyReport(day) … 画面②「日報」用。その業務日の行(機械ぶん + 全社)を返す
//
// 偽データモードでは src/mock/*.json を返し、本物モードでは Supabase を読む。
// 本物モードで読む表とビュー(差分案_鍵とRLS_2026-09-09.md で作るもの):
//   machines           … 機械の名前・表示名・LOW(low_a)
//   v_latest_readings  … 機械ごとの最新1行(readings から distinct on で作ったビュー)
//   daily_reports      … 日報(GAS の「日報」タブ17列を GAS が写す。差分案_画面2日報_2026-09-09.md)
// ============================================================================
import { supabase, IS_MOCK } from './supabase.js'
import mockMachines from '../mock/machines.json'
import mockLatest from '../mock/readings_latest.json'
import mockDaily from '../mock/daily_reports.json'

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
