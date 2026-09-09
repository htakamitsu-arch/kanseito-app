# KANSEITO 画面(Web アプリ)の README v1 — 2026-09-09

Vue 3 + Vite + supabase-js。**1画面=1ファイル**、HTML に近い書き方。判断基準は「町工場でシロウトが立ち上げられるか」。
作る順: ①今の状態(W1・骨組み済) → ②日報(W3) → ③機械カルテ(W4)。工程は 報告_アプリ開発係_2026-09-09.md §3。

## 1. ファイル構成(どこを見れば何があるか)

```
app/
├─ index.html                 画面の入れ物(1枚だけ)。触らない
├─ package.json               部品の一覧と「npm run …」の定義
├─ vite.config.js             組み立て道具の設定。base(URL の先頭)は自動。触らない
├─ .env.example               設定の見本(鍵の名前だけ)。コピーして .env にする
├─ .env.mock                  偽データモード用(鍵なし)。npm run dev:mock が読む
├─ .gitignore                 GitHub に上げないもの(node_modules / dist / .env)
├─ .github/workflows/pages.yml  GitHub Pages への自動公開(docs/公開手順_GitHubPages_v1.md)
├─ README_app_v1.md           このファイル
├─ docs/
│   ├─ 画面1_試作_2026-09-09.png          画面①の試作(PC 幅・偽データ)
│   ├─ 画面1_試作_スマホ幅_2026-09-09.png  同・スマホ幅
│   └─ 公開手順_GitHubPages_v1.md
└─ src/
    ├─ main.js                入口。App.vue を描くだけ。触らない
    ├─ style.css              全画面共通の見た目。★状態の色はここ1か所(電源OFF=灰 / 通電=黄 / 高負荷=緑 / 赤枠=無通信)
    ├─ App.vue                骨組み: 上の帯(画面切替・ログイン中の人)+ いま選ばれている画面
    ├─ lib/
    │   ├─ supabase.js        Supabase につなぐ部品(1か所だけ)。偽データモードなら null
    │   ├─ data.js            データの取り口。画面は表の名前を知らなくてよい。偽/本物の切替はここ
    │   └─ status.js          「状態を色と言葉に直す」決まり・「何分前か」・11分の無通信
    ├─ mock/
    │   ├─ machines.json      偽データ: 9台の名前・表示名・LOW/HIGH(9/9 の機械設定シートの値)
    │   └─ readings_latest.json  偽データ: 各機械の最新1行(minutes_ago = 何分前か)
    └─ pages/                 ★1画面=1ファイル
        ├─ NowStatus.vue      画面①「今の状態」(できている)
        ├─ DailyReport.vue    画面②「日報」(場所取りだけ・W3)
        ├─ MachineKarte.vue   画面③「機械カルテ」(場所取りだけ・W4)
        └─ Login.vue          ログイン(会社の Google アカウント)
```

画面の切替は URL の `#` の後ろ: `#/now` ①・`#/daily` ②・`#/karte` ③(GitHub Pages で直打ちしても 404 にならない方式)。

## 2. 動かし方(手元の PC)

前提: Node v24.19.0 / npm 11.17.0(9/9 確認済み)。

| やること | PowerShell に打つ(1行ずつ) | 見えるもの |
|---|---|---|
| 初回だけ: 部品を入れる | `cd C:\Users\user\Documents\00-claude\machine-monitor\kanseito_web\app` → `npm install` | `added 43 packages`(9/9 実行済み。node_modules/ ができる) |
| **偽データで動かす**(鍵なし) | `npm run dev:mock` | `Local: http://localhost:5173/` と出る → ブラウザで開く。上に黄色い帯「偽データモード」 |
| 本物で動かす(鍵あり) | `.env` を作ってから `npm run dev` | ログイン画面 → 会社アカウント → 9台 |
| 止める | PowerShell で `Ctrl + C` | — |
| 公開用に組み立てる(ふだん不要) | `npm run build` | `dist/` ができる(GitHub Actions が自動でやるので手ではやらない) |

npm install で `esbuild … install scripts not yet covered by allowScripts` という黄色い警告が出ますが、組み立て(`vite build`)は通ることを 9/9 に確認済み。実害なし。

## 3. 偽データモード ⇔ 本物モードの切替

| | 偽データモード | 本物モード |
|---|---|---|
| 起動 | `npm run dev:mock`(`.env.mock` を読む・VITE_MOCK=1) | `npm run dev`(`.env` を読む) |
| Supabase | 繋がない | anon 鍵 + ログインした人の権限で読む |
| データ | `src/mock/*.json`(「何分前か」だけ現在時刻から計算) | `machines` 表 + `v_latest_readings` ビュー |
| ログイン | 不要 | 会社の Google アカウント(Login.vue) |
| 目印 | 上に黄色い帯が必ず出る | 帯なし・右上にメールアドレス |

本物モードにするには(順番どおり):
1. `差分案_鍵とRLS_2026-09-09.md` の SQL が入り、試験8つが合格していること
2. `.env.example` をコピーして `.env` を作る(同じフォルダ)
3. `.env` の `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` に本物を入れる(Supabase → Project Settings → API【位置未確認】の Project URL と anon public)。**service_role は入れない**
4. `.env` の `VITE_MOCK=1` を `VITE_MOCK=0` にする(か行を消す)
5. `npm run dev`

`.env` は `.gitignore` で GitHub に上がらない。**`.env.example` に本物の鍵を書かない。**

## 4. 画面①の決まり(status.js)

| 表示 | 条件 | 出どころ |
|---|---|---|
| データなし(薄灰) | その機械の行が1行も無い(2号機 shizuoka は GAS 直送なのでこれになる) | — |
| 電源OFF(灰) | fw_state = POWER_OFF、または 平均 < LOW(machines.low_a) | ファームの判定 / 機械設定の LOW |
| 高負荷(緑) | fw_state = HIGH_LOAD | ファームの判定(HIGH) |
| 通電(黄) | fw_state = LOW_LOAD | 同上 |
| **赤枠** | 最終データ(measured_at)から **11分以上** | GAS checkHeartbeat: `STALE_THRESHOLD_MINUTES = 10` を `>` で比べ・10分おき実行 = 実質11分(Code.gs 370・851行) |

「加工 / 段取り / 暖機」は出さない(判定の式は GAS のまま。②③で出す)。60秒ごとに自動で読み直す。

## 5. 次に作る画面(場所)

| 画面 | ファイル | 元データ | 時期 | 高満氏の手 |
|---|---|---|---|---|
| ② 日報 | `src/pages/DailyReport.vue` | `daily_reports`(GAS の日報タブ17列を GAS が写す) | W3 9/24〜 | GAS 貼り替え1本 |
| ③ カルテ第1版 | `src/pages/MachineKarte.vue` | `readings`(今日の毎分・直近31日まで読める) | W4 10/1〜 | 事務所モニタを1台決める |
| ログイン | `src/pages/Login.vue`(済) | Supabase Auth(Google) | W1 | Google Cloud の設定(差分案 §2) |

新しい画面を足すときは: `src/pages/` にファイルを1つ作り、`App.vue` の `pages` に1行足すだけ。

## 6. 困ったとき

| 症状 | 見るところ |
|---|---|
| 画面が真っ白 | ブラウザで F12 → Console の赤い文をそのまま私に貼る |
| 「.env に … が入っていません」 | §3 の手順2〜4 |
| 「machines を読めません: permission denied」 | 鍵とRLS の SQL 手順4(grant)が入っていない |
| ログインできるが 0 台 | tenant_users に自分の行が無い(差分案 §3-1)。手順5 のトリガーか email_domain を見る |
| 全部のカードが赤枠 | Supabase の受信が止まっている(画面ではなく受信側。受信窓口のURL.txt [1] の ping を見る) |
