// ============================================================================
// 「状態を色と言葉に直す」決まり。画面①で使う。判定(加工/段取り/暖機)はここではしない。
//
//   ファームの状態(fw_state)と LOW(machines.low_a)だけで決める:
//     データなし                        → none 「データなし」
//     POWER_OFF または 平均 < LOW       → off  「電源OFF」
//     HIGH_LOAD                        → high 「高負荷」
//     LOW_LOAD                         → low  「通電」
//     それ以外(UNKNOWN など)           → none 「判定不能」(届いているが状態が読めない・2026-09-18 ①②試作)
//
//   無通信: 最終データ(measured_at)から STALE_MIN 分以上たっていたら赤枠。
//     GAS の checkHeartbeat は STALE_THRESHOLD_MINUTES = 10 を「>」で比べ、10分おきに走るので
//     実際の通知は 11分以降。ここも同じ「11分以上」にそろえる(Code.gs 370行・851行)。
// ============================================================================
export const STALE_MIN = 11

// 状態 → { cls: CSSクラス名, text: 表示する言葉 }
export function stateOf(machine, latest) {
  if (!latest) return { cls: 'none', text: 'データなし' }
  const low = machine.low_a
  if (latest.fw_state === 'POWER_OFF') return { cls: 'off', text: '電源OFF' }
  if (low !== null && low !== undefined && latest.avg_a !== null && latest.avg_a < low) {
    return { cls: 'off', text: '電源OFF' }   // ファームがまだ切り替えていなくても、LOW 未満なら電源OFF扱い
  }
  if (latest.fw_state === 'HIGH_LOAD') return { cls: 'high', text: '高負荷' }
  if (latest.fw_state === 'LOW_LOAD')  return { cls: 'low',  text: '通電' }
  return { cls: 'none', text: '判定不能' }
}

// 判定不能か(届いているのに状態が読めない)。データなしは含めない
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
// 返り値: [{ machine, kind: 'stale'|'undecidable', since: iso }] を開始が古い順に
export function checkList(rows, now = Date.now()) {
  const out = []
  for (const r of rows) {
    if (!r.latest) continue                                   // データなし(GAS 直送)は別枠で理由を出す
    if (isStale(r.latest, now)) out.push({ machine: r.machine, kind: 'stale', since: r.latest.measured_at })
    else if (isUndecidable(r.machine, r.latest)) out.push({ machine: r.machine, kind: 'undecidable', since: r.latest.measured_at })
  }
  return out.sort((a, b) => new Date(a.since) - new Date(b.since))
}

// 最終データから何分たったか(整数)。データなしは null
export function minutesSince(latest, now = Date.now()) {
  if (!latest) return null
  return Math.floor((now - new Date(latest.measured_at).getTime()) / 60000)
}

// 無通信か(11分以上)。データなしの機械は「無通信」とは言わない(2号機は GAS 直送で Supabase に来ない)
export function isStale(latest, now = Date.now()) {
  const m = minutesSince(latest, now)
  return m !== null && m >= STALE_MIN
}

// 「N分前」の表示文
export function agoText(latest, now = Date.now()) {
  const m = minutesSince(latest, now)
  if (m === null) return 'まだ1行も届いていません'
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
