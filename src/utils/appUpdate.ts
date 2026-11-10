import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core'
import { version as currentVersion } from '../../package.json'

const repository = 'guangfengliao-wq/starward'
const nativeUpdate = registerPlugin<{ openDownload(options: { url: string }): Promise<void> }>('AppUpdate')

export interface AppRelease {
  version: string
  notes: string
  url: string
  size: number
}

export function compareVersions(left: string, right: string): number {
  if (![left, right].every(value => /^\d+\.\d+\.\d+$/.test(value))) throw new Error('版本号格式无效')
  const a = left.split('.').map(Number)
  const b = right.split('.').map(Number)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1
  return 0
}

export function parseRelease(data: unknown, installed = currentVersion): AppRelease | null {
  if (!data || typeof data !== 'object') throw new Error('更新信息格式不正确，请稍后重试')
  const release = data as Record<string, unknown>
  if (release.draft || release.prerelease) return null
  const version = String(release.tag_name ?? '').replace(/^v/, '')
  if (compareVersions(version, installed) <= 0) return null
  const filename = `starward-v${version}.apk`
  const assets = Array.isArray(release.assets) ? release.assets : []
  const asset = assets.find(item => item && item.name === filename && item.state === 'uploaded')
  if (!asset || typeof asset.size !== 'number' || asset.size <= 0) throw new Error('新版本安装包尚未就绪，请稍后再试')
  const expected = `https://github.com/${repository}/releases/download/v${version}/${filename}`
  if (asset.browser_download_url !== expected) throw new Error('安装包下载地址不正确，已停止更新')
  return { version, notes: typeof release.body === 'string' && release.body.trim() ? release.body : '此版本暂无更新公告。', url: expected, size: asset.size }
}

export async function checkForUpdate(): Promise<AppRelease | null> {
  const url = `https://api.github.com/repos/${repository}/releases/latest`
  let status: number
  let data: unknown
  try {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({ url, headers: { Accept: 'application/vnd.github+json' }, connectTimeout: 15000, readTimeout: 15000 })
      status = response.status
      data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
    } else {
      const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) })
      status = response.status
      data = await response.json()
    }
  } catch {
    throw new Error('无法连接更新服务，请检查网络是否能访问 GitHub 后重试')
  }
  if (status === 404) throw new Error('暂未找到公开发布的版本，请稍后再试')
  if (status === 403 || status === 429) throw new Error('更新检查过于频繁，请稍后再试')
  if (status !== 200) throw new Error('更新服务暂时不可用，请稍后重试')
  return parseRelease(data)
}

export async function downloadUpdate(release: AppRelease): Promise<void> {
  const expected = `https://github.com/${repository}/releases/download/v${release.version}/starward-v${release.version}.apk`
  if (release.url !== expected || !/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('安装包地址无效')
  if (Capacitor.getPlatform() === 'android') await nativeUpdate.openDownload({ url: release.url })
  else window.location.assign(release.url)
}
