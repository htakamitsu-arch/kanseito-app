# 公開手順: GitHub Pages に画面を置く(v1・2026-09-09)

対象: `machine-monitor\kanseito_web\app\` の画面を、インターネットの URL で開けるようにする(0円)。
やる時期: W2(9/17〜9/23)。**その前に 差分案_鍵とRLS の試験8つが合格していること。**
出どころ: Vite 公式「Deploying a Static Site → GitHub Pages」(vite.dev/guide/static-deploy・2026-09-09 に読んだ)。

用語:
- **GitHub** = プログラムのファイルを預ける倉庫のサービス。**リポジトリ** = 倉庫の1部屋(1つのアプリ=1部屋)
- **GitHub Pages** = その部屋の中身を Web ページとして公開する仕組み
- **GitHub Actions** = 部屋にファイルを入れるたびに自動で「組み立て→公開」を走らせる係(`.github/workflows/pages.yml` に書いてある)
- **push** = 手元のファイルを部屋に送ること

「未確認」= 私が今日この目で見ていない画面の位置。開いた画面と違えばスクリーンショットを送ってください。

---

## 0. 全体の流れ(5段)

| 段 | 誰 | やること | 所要 |
|---|---|---|---|
| A | 高満氏 | GitHub のアカウントを作る(**私は代行できません**) | 10分 |
| B | 高満氏 | リポジトリ(部屋)を1つ作る | 3分 |
| C | 私(高満氏の PC で) | 画面のファイルを部屋に送る(push) | 5分 |
| D | 高満氏 | 部屋の設定を3つ(Pages の Source / Secrets 2つ) | 5分 |
| E | 高満氏 | Supabase と Google に「公開後の URL」を教える | 5分 |

---

## A. GitHub のアカウントを作る【高満氏・代行不可】

すでに持っているかもしれません(Supabase のサインアップに GitHub を使った可能性あり・**未確認**)。
`https://github.com/login` を開いて入れれば、この段は飛ばして B へ。

1. ブラウザで `https://github.com/signup` を開く
2. Email = **会社のメール**(h.takamitsu@seikou-seimitsu.com)/ Password = 新しく決める(控える)/ Username = 例 `seikou-seimitsu`(**これが URL の一部になる**: `https://seikou-seimitsu.github.io/…`。会社名で決めるのを推奨)
3. 「Verify your account」のパズルが出たら自分で解く(私はできません)
4. メールに届いた8桁のコードを入れる
5. 「Free」プランのまま進む(Pages は Free で使える。公開リポジトリなら無料・私的リポジトリでも Free の Pages は使えるが**制限があるので「公開(Public)」を推奨**。画面のコードには鍵を入れないので公開して困るものは無い)

---

## B. リポジトリ(部屋)を作る【高満氏】

1. 右上の「+」→「New repository」
2. Repository name = `kanseito-app`(**この名前が URL の後ろになる**: `https://<ユーザー名>.github.io/kanseito-app/`)
3. Public を選ぶ
4. 「Add a README file」は**チェックしない**(私が中身を入れるため空のままにする)
5. 「Create repository」
6. できた画面の URL(例 `https://github.com/seikou-seimitsu/kanseito-app`)を私に教える

---

## C. 画面のファイルを部屋に送る【私が PowerShell でやる・高満氏は見ているだけ】

高満氏の PC で、私が次を実行します(1行ずつ。失敗したらその場で止めて報告)。
初回だけ、GitHub が「ブラウザでログインしてください」と出すので、**その画面のボタンだけ高満氏が押す**。

```powershell
cd C:\Users\user\Documents\00-claude\machine-monitor\kanseito_web\app
git init -b main
git add .
git commit -m "KANSEITO 画面 v0.1: ①今の状態"
git remote add origin https://github.com/<ユーザー名>/kanseito-app.git
git push -u origin main
```

送られないもの(`.gitignore` で除外): `node_modules/`(部品)・`dist/`(組み立て結果)・**`.env`(鍵)**。
送られるもの: `src/`・`index.html`・`package.json`・`.github/workflows/pages.yml`・`.env.example`(見本)・`docs/`。

---

## D. 部屋の設定を3つ【高満氏・私が画面を見ながら案内】

### D-1. Pages の出どころを「GitHub Actions」にする(Vite 公式の手順どおり)

1. リポジトリの画面 → 上のタブ「**Settings**」
2. 左メニュー「**Pages**」
3. 「Build and deployment」の「**Source**」のプルダウン → 「**GitHub Actions**」を選ぶ(保存ボタンは無い。選んだ時点で有効)

### D-2. Supabase の鍵を2つ登録する(Secrets)

pages.yml が組み立てるとき、この2つを画面に埋め込みます。anon 鍵は「公開してよい鍵」ですが、コードに直書きせず Secrets に置きます。

1. Settings → 左メニュー「**Secrets and variables**」→「**Actions**」
2. 「**New repository secret**」
3. Name = `VITE_SUPABASE_URL` / Secret = `https://tprsnucpshsqtwibkmun.supabase.co` → Add secret
4. もう一度「New repository secret」→ Name = `VITE_SUPABASE_ANON_KEY` / Secret = Supabase の anon public 鍵(取り方: Supabase → Project Settings → API【位置未確認】→ Project API keys の **anon public**。**service_role の方は絶対に貼らない**)→ Add secret

### D-3. 動いたか見る

1. 上のタブ「**Actions**」→ 一番上の行「Deploy to GitHub Pages」が緑のチェックになるまで待つ(1〜2分)
2. 緑になったら Settings → Pages の上部に「Your site is live at `https://<ユーザー名>.github.io/kanseito-app/`」と出る。その URL を開く
3. **ログイン画面**が出れば合格(この時点ではまだログインできない=E が済んでいないため)

赤い×になったら: Actions の行をクリック → 赤い段をクリック → 出ている文をそのまま私に貼る。**同じ失敗を2回したら止めて別の道を探す。**

---

## E. Supabase と Google に「公開後の URL」を教える【高満氏・私が案内】

公開後の URL = `https://<ユーザー名>.github.io/kanseito-app/`(D-3 で出たもの)。

| どこ | 項目 | 入れる値 |
|---|---|---|
| Supabase → Authentication → URL Configuration | Site URL | `https://<ユーザー名>.github.io/kanseito-app/` |
| 同上 | Redirect URLs に追加 | `https://<ユーザー名>.github.io/kanseito-app/**` |
| Google Cloud → 認証情報 → OAuth クライアント `kanseito-web` | 承認済みの JavaScript 生成元に追加 | `https://<ユーザー名>.github.io` |

(Google の「承認済みのリダイレクト URI」は Supabase のコールバック URL のままで変えない。画面の URL は入れない)

---

## F. 合格の見方(W2 の合格条件)

1. スマホで `https://<ユーザー名>.github.io/kanseito-app/` を開く → 「会社の Google アカウントでログイン」→ 会社アカウント → 9台のカードが出る
2. スマホの「ホーム画面に追加」(iPhone: 共有ボタン → ホーム画面に追加 / Android: メニュー → ホーム画面に追加)でアイコンにする
3. 無通信の試験: 4号機の電源を1回切る(**暖機・測定の外で**)→ 11分後に該当カードが赤枠 → 電源を戻す → 次の受信で赤枠が消える(規則3: わざと落とす)

---

## G. 以後の更新のしかた

私が `app/` を直す → `git add . ; git commit -m "…" ; git push` → 1〜2分で自動公開。高満氏の手は要らない。
戻したいとき: `git revert HEAD` → push(1つ前の状態に戻る)。もっと前に戻すのも同じ要領。

## H. 気をつけること

- **`.env` は絶対に push しない**(.gitignore に入れてある。`git status` に `.env` が出たら止める)
- リポジトリ名を変えると URL が変わり、E をやり直しになる。**名前は最初に決めて変えない**
- Pages は「静的なファイル置き場」。Supabase への読み書きは画面の中の JavaScript が直接やる(サーバーは無い)。だから鍵(RLS)が全て
