<template>
  <div class="update-row">
    <div><h3>版本更新</h3><p>当前版本 v{{ currentVersion }}</p></div>
    <button class="mode-button" type="button" :disabled="checking" @click="check">{{ checking ? '正在检查…' : '检查更新' }}</button>
  </div>
  <p v-if="status" class="update-status" role="status">{{ status }}</p>
  <dialog ref="notice" class="update-dialog glass-surface" @keydown.esc.stop aria-labelledby="update-title">
    <div class="update-content">
      <h2 id="update-title">发现新版本 v{{ release?.version }}</h2>
      <p class="version-info">v{{ currentVersion }} → v{{ release?.version }} · {{ ((release?.size ?? 0) / 1024 / 1024).toFixed(1) }} MB</p>
      <h3>更新公告</h3>
      <pre class="release-notes">{{ release?.notes }}</pre>
      <p class="install-help">确认后通过浏览器下载 APK，下载完成后打开文件，按系统提示覆盖安装。</p>
      <p v-if="downloadError" class="error" role="alert">{{ downloadError }}</p>
      <div class="actions">
        <button class="mode-button" type="button" :disabled="opening" @click="notice?.close()">稍后再说</button>
        <button class="mode-button primary" type="button" :disabled="opening" @click="confirmUpdate">{{ opening ? '正在打开…' : '下载并更新' }}</button>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { version as currentVersion } from '../../package.json'
import { checkForUpdate, downloadUpdate, type AppRelease } from '../utils/appUpdate'

const checking = ref(false)
const opening = ref(false)
const status = ref('')
const downloadError = ref('')
const release = ref<AppRelease | null>(null)
const notice = ref<HTMLDialogElement | null>(null)

async function check() {
  if (checking.value) return
  checking.value = true
  status.value = ''
  downloadError.value = ''
  try {
    release.value = await checkForUpdate()
    if (!release.value) status.value = '当前已是最新版本'
    else {
      await nextTick()
      notice.value?.showModal()
    }
  } catch (error) {
    status.value = error instanceof Error ? error.message : '检查更新失败，请重试'
  } finally { checking.value = false }
}

async function confirmUpdate() {
  if (!release.value || opening.value) return
  opening.value = true
  downloadError.value = ''
  try {
    await downloadUpdate(release.value)
    notice.value?.close()
    status.value = '已打开下载链接，请下载后按系统提示安装'
  } catch {
    downloadError.value = '无法打开下载链接，请确认已安装浏览器后重试'
  } finally { opening.value = false }
}
</script>

<style scoped>
.update-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px;
  border-top: 1px solid var(--border);
}
.update-row h3, .update-content h3 { margin: 0; font-size: 14px; }
.update-row p, .version-info, .install-help, .update-status {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.5;
}
.update-row button { flex: none; white-space: nowrap; }
.update-status { max-width: 24ch; padding: 0 8px 8px; }
.update-dialog {
  margin: auto;
  width: min(460px, calc(100% - 32px));
  max-height: calc(100dvh - 32px);
  padding: 0;
  border-radius: 24px;
  color: var(--text);
}
.update-dialog::backdrop { background: rgb(0 0 0 / 65%); }
.update-content { padding: 16px; }
.update-content h2 { font-size: 20px; }
.version-info { margin: 6px 0 16px; }
.release-notes {
  max-height: 32dvh;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: var(--background);
  font: inherit;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.primary, .error { color: var(--accent); }
.primary { border-color: var(--accent); }
button:disabled { opacity: 0.6; cursor: wait; }
</style>

