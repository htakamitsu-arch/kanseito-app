// ============================================================================
// Vite の設定(画面を組み立てる道具の設定)。ふつうは触らない。
//
// base = 画面が置かれる URL の「先頭のフォルダ名」。
//   手元の PC(npm run dev)          → '/'
//   GitHub Pages(https://ユーザー名.github.io/リポジトリ名/) → '/リポジトリ名/'
// GitHub Actions(.github/workflows/pages.yml)が GITHUB_PAGES_BASE を自動で入れるので、
// 手で書き換える必要はない。
// ============================================================================
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: process.env.GITHUB_PAGES_BASE || '/',
})
