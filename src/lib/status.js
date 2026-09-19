// ============================================================================
// 「状態を色と言葉に直す」決まり。画面①で使う。判定(加工/段取り/暖機)はここではしない。
//
//   ファームの状態(fw_state)と LOW(machines.low_a)だけで決める:
//     最新の1行が無い                    → none 「無通信」(直近31日に1行も届いていない。2026-09-19 「データなし」を廃止)
//     POWER_OFF または 平均 < LOW       → off  「電源OFF」
//     HIGH_LOAD                        → high 「高負荷」
//     LOW_LOAD                         → low  「通電」
//     それ以外(UNKNOWN など)           → none 「判定不能」(届いているが状態が読めない・2026-09-18 ①②試作)
//
//   無通信: 最終データ(measured_at)から STALE_MIN 分以上たっていたら赤枠。最新の1行が無い機械も無通信(赤枠・要確認)。
//     「データなし・異常ではありません」はやめた(高満氏 2026-09-18「データなしは無いように」)。
//     画面に出さない機械(実験係など)は machines.show_on_screen = false で lib/data.js が外す。
//     GAS の checkHeartbeat は STALE_THRESHOLD_MINUTES = 10 を「>」で比べ、10分おきに走るので
//     実際の通知は 11分以降。ここも同じ「11分以上」にそろえる(Code.gs 370行・851行)。
// ============================================================================
export const STALE_MIN = 11

// 最新の1行が無い機械に出す文。readings は直近31日しか読めない(RLS)ので、
// 「まだ1行も来ていない」と「31日以上止まっている」のどちらもこの1文で正しい
export const NEVER_TEXT = '直近31日に1行も届いていません'

// 状態 → { cls: CSSクラス名, text: 表示する言葉 }
export function stateOf(machine, latest) {
  if (!latest) return { cls: 'none', text: '無通信' }
  const low = machine.low_a
  if (latest.fw_state === 'POWER_OFF') return { cls: 'off', text: '電源OFF' }
  if (low !== null && low !== undefined && latest.avg_a !== null && latest.avg_a < low) {
    return { cls: 'off', text: '電源OFF' }   // ファームがまだ切り替えていなくても、LOW 未満なら電源OFF扱い
  }
  if (latest.fw_state === 'HIGH_LOAD') return { cls: 'high', text: '高負荷' }
  if (latest.fw_state === 'LOW_LOAD')  return { cls: 'low',  text: '通電' }
  return { cls: 'none', text: '判定不能' }
}

// 判定不能か(届いているのに状態が読めない)。最新の1行が無い機械は含めない(そちらは無通信)
export function isUndecidable(machine, latest) {
  return !!latest && stateOf(machine, latest).cls === 'none'
}

// 「HH:MM から(N分)」の文。開始時刻 iso と今から、経過を分で出す(2026-09-18 ①②試作)
export function sinceText(iso, now = Date.now()) {
  if (!iso) return ''
  const m = Math.floor((now - new Date(iso).getTime()) / 60000)
  let d
  if (m < 1) d = '1分未満'
  else if (m < 60) d = m + '分'
  else if (m < 60 * 24) d = Math.floor(m / 60) + '時間' + (m % 60) + '分'
  else d = Math.floor(m / 1440) + '日'
  return clockText(iso) + ' から(' + d + ')'
}

// 画面①の上に出す「いま確認すること」。決定(2026-09-18 高満氏): 無通信と判定不能だけ。電源OFF は出さない。
// 返り値: [{ machine, kind: 'stale'|'undecidable', since: iso|null }] を開始が古い順に。
//   since が null = 最新の1行が無い機械(いつからか分からない)。いちばん上に並べる
export function checkList(rows, now = Date.now()) {
  const out = []
  for (const r of rows) {
    if (!r.latest) out.push({ machine: r.machine, kind: 'stale', since: null })   // 1行も無い = 無通信として要確認に出す
    else if (isStale(r.latest, now)) out.push({ machine: r.machine, kind: 'stale', since: r.latest.measured_at })
    else if (isUndecidable(r.machine, r.latest)) out.push({ machine: r.machine, kind: 'undecidable', since: r.latest.measured_at })
  }
  const t = (c) => (c.since ? new Date(c.since).getTime() : 0)   // null は 0 = いちばん古い扱い
  return out.sort((a, b) => t(a) - t(b))
}

// 最終データから何分たったか(整数)。最新の1行が無ければ null
export function minutesSince(latest, now = Date.now()) {
  if (!latest) return null
  return Math.floor((now - new Date(latest.measured_at).getTime()) / 60000)
}

// 無通信か(11分以上、または最新の1行が無い)
export function isStale(latest, now = Date.now()) {
  if (!latest) return true
  const m = minutesSince(latest, now)
  return m !== null && m >= STALE_MIN
}

// 「N分前」の表示文
export function agoText(latest, now = Date.now()) {
  const m = minutesSince(latest, now)
  if (m === null) return NEVER_TEXT
  if (m < 1) return 'たった今'
  if (m < 60) return m + '分前'
  if (m < 60 * 24) return Math.floor(m / 60) + '時間' + (m % 60) + '分前'
  return Math.floor(m / 1440) + '日前'
}

// 電流の表示(小数1桁。無ければ "--")
export function ampText(latest) {
  if (!latest || latest.avg_a === null || latest.avg_a === undefined) return '--'
  return Number(latest.avg_a).toFixed(1)
}

// 時刻の表示(日本時間 HH:MM)
export function clockText(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
}
