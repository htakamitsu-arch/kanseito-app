<!-- ============================================================================
  ログイン画面。会社の Google アカウントでログインする(Supabase Auth の Google ログイン)。

  hd=会社ドメイン は「Google の画面で会社アカウントを先に出す」ためのお願いにすぎない。
  本当の門番は Supabase 側:
    ・tenant_users に行が無い人は、ログインできても何も見えない(RLS)
    ・差分案_鍵とRLS_2026-09-09.md の「新しい人が来たら会社を見て tenant_users に入れる」しかけ
============================================================================ -->
<script setup>
import { ref } from 'vue'
import { supabase, ALLOWED_DOMAIN } from '../lib/supabase.js'

const error = ref('')

async function login() {
  error.value = ''
  // ログイン後に戻ってくる場所。GitHub Pages なら https://xxx.github.io/リポジトリ名/ になる。
  // ★この URL を Supabase の Redirect URLs に登録していないと、ログイン後に戻れない(公開手順_GitHubPages_v1.md)
  const redirectTo = location.origin + import.meta.env.BASE_URL
  const { error: e } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { hd: ALLOWED_DOMAIN } },
  })
  if (e) error.value = 'ログインに失敗しました: ' + e.message
}
</script>

<template>
  <div class="login">
    <h2>KANSEITO にログイン</h2>
    <button @click="login">会社の Google アカウントでログイン</button>
    <div class="error" v-if="error">{{ error }}</div>
    <p class="note">
      使えるのは @{{ ALLOWED_DOMAIN }} のアカウントだけです。<br />
      他のアカウントでログインしても、機械は1台も表示されません。
    </p>
  </div>
</template>
