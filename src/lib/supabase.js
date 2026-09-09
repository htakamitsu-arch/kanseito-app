// ============================================================================
// Supabase につなぐ部品(1か所だけ)。他のファイルは必ずここから import する。
//
//   偽データモード(VITE_MOCK=1)        → supabase は null。どこにも繋がない
//   本物モード(.env に URL と anon 鍵) → supabase-js のクライアントを1つ作る
//
// anon 鍵は「画面に埋めてよい鍵」。RLS(会社ごとの鍵)があるので、
// ログインした人の会社の行しか返らない。service_role は絶対にここに入れない。
// ============================================================================
import { createClient } from '@supabase/supabase-js'

export const IS_MOCK = import.meta.env.VITE_MOCK === '1'
export const ALLOWED_DOMAIN = import.meta.env.VITE_ALLOWED_DOMAIN || 'seikou-seimitsu.com'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (!IS_MOCK && url && key) ? createClient(url, key) : null

// 設定が足りないときに画面に出す文(黙って動かないのを防ぐ)
export function configProblem() {
  if (IS_MOCK) return ''
  if (!url || !key) return '.env に VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY が入っていません(.env.example を見る)。鍵が無いあいだは VITE_MOCK=1 で偽データモードにしてください。'
  return ''
}
