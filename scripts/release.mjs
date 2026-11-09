import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import QRCode from 'qrcode';
import { notifyLark, validateWebhook } from './lark-notify.mjs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function createReleaseQr(download, version, output = join(root, 'release')) {
  const url = new URL(download);
  if (url.origin !== 'https://github.com') throw new Error('远程下载地址必须属于 GitHub。');
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('二维码版本号无效。');
  const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  mkdirSync(output, { recursive: true });
  const png = join(output, `github-install-v${version}.png`);
  const html = join(output, `github-install-v${version}.html`);
  const options = { errorCorrectionLevel: 'M', margin: 4, width: 640 };
  await QRCode.toFile(png, url.href, options);
  const image = await QRCode.toDataURL(url.href, options);
  writeFileSync(html, `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>繁星 v${version}</title><style>body{font:16px system-ui;background:#eeedff;color:#45405e;text-align:center;padding:24px}main{max-width:560px;margin:auto;background:white;border-radius:24px;padding:28px}img{max-width:100%;height:auto}p{line-height:1.8}a{color:#4f46e5;overflow-wrap:anywhere}</style><main><h1>繁星 v${version}</h1><p>扫码下载 Android 安装包</p><img src="${image}" alt="GitHub APK 下载二维码"><p><a href="${escape(url.href)}">下载 starward-v${version}.apk</a></p><p>需要联网访问 GitHub，无需电脑开机或连接同一 Wi-Fi。<br>私有仓库需要相应的 GitHub 登录权限。<br>下载后按系统提示安装；更新时使用相同签名覆盖安装。</p></main></html>`, 'utf8');
  return { png, html };
}

function git(args, options = {}) {
  const result = spawnSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, ...args], { cwd: root, encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) throw new Error('Git 操作失败，请检查仓库配置、登录状态和网络。');
  return result.stdout.trim();
}

export function parseRepository(remote) {
  const match = remote.match(/^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  if (!match) throw new Error('origin 必须是 github.com 的 HTTPS 或 SSH 仓库地址。');
  return `${match[1]}/${match[2]}`;
}

// Keep remote changes separate from local validation so tests never publish.
export async function publishRelease({ api, repository, version, commit, filename, bytes, digest, notes = '' }) {
  const base = `https://api.github.com/repos/${repository}`;
  const tag = `v${version}`;
  let release = await api(`${base}/releases/tags/${tag}`, { allow404: true });
  if (!release) {
    // A previous interrupted upload can leave an unpublished draft.
    for (let page = 1; ; page++) {
      const items = await api(`${base}/releases?per_page=100&page=${page}`);
      release = items.find(item => item.tag_name === tag);
      if (release || items.length < 100) break;
    }
  }
  if (!release) {
    release = await api(`${base}/releases`, { method: 'POST', json: {
      tag_name: tag, target_commitish: commit, name: `${tag} - 繁星`, draft: true,
      body: `${notes ? `${notes.trim()}\n\n` : ''}下载附件 \`${filename}\` 安装（Android 7.0 及以上）。\n\n本安装包为调试签名版本；覆盖安装需保持签名一致，卸载会清除本地数据。\n\nSHA-256：\`${digest}\`\n\n音频来源与授权说明见仓库 README。`,
    } });
  }
  const assets = await api(`${base}/releases/${release.id}/assets?per_page=100`);
  let asset = assets.find(item => item.name === filename);
  if (asset?.state === 'starter') {
    if (!release.draft) throw new Error('已发布版本含未完成的附件，请在 GitHub 检查后重试。');
    console.log('清理上次上传中断留下的草稿附件，重新上传…');
    await api(`${base}/releases/assets/${asset.id}`, { method: 'DELETE' });
    asset = null;
  }
  const verify = async item => {
    if (item.state && item.state !== 'uploaded') throw new Error('附件上传尚未完成，草稿已保留，请重试 npm run release。');
    if (item.size !== bytes.length) return false;
    if (item.digest) return item.digest.toLowerCase() === `sha256:${digest}`;
    console.log('GitHub 未返回摘要，正在下载附件校验 SHA-256…');
    const remoteBytes = await api(`${base}/releases/assets/${item.id}`, { binary: true });
    return createHash('sha256').update(remoteBytes).digest('hex') === digest;
  };
  if (asset) {
    if (!await verify(asset)) {
      throw new Error('同名附件已存在，但内容不同；不会覆盖，请检查版本号。');
    }
  } else {
    const uploadUrl = new URL(release.upload_url.replace(/\{.*$/, ''));
    if (uploadUrl.origin !== 'https://uploads.github.com') throw new Error('GitHub 上传地址异常。');
    uploadUrl.searchParams.set('name', filename);
    console.log('正在上传 APK，请保持网络连接…');
    asset = await api(uploadUrl.href, { method: 'POST', bytes });
    if (!await verify(asset)) throw new Error('上传文件校验失败，发布草稿已保留，请检查后重试。');
  }
  if (release.draft) {
    release = await api(`${base}/releases/${release.id}`, { method: 'PATCH', json: { draft: false } });
  }
  // Upload responses for drafts contain an untagged-* URL that changes on publication.
  const download = `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
  return { release: release.html_url, download };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--dry-run')) throw new Error('用法：npm run release [-- --dry-run]');
  const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('package.json 版本号格式无效。');
  const filename = `starward-v${version}.apk`;
  let bytes;
  try { bytes = readFileSync(join(root, 'release', filename)); }
  catch { throw new Error(`找不到 release/${filename}，请先运行 npm run pack。`); }
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== 0x04034b50) throw new Error('APK 文件为空或格式无效。');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const repository = parseRepository(git(['remote', 'get-url', 'origin']));
  const commit = git(['rev-parse', 'HEAD']);
  console.log(`仓库：${repository}\n版本：v${version}\n文件：release/${filename}\n大小：${bytes.length} bytes\nSHA-256：${digest}`);
  if (args.includes('--dry-run')) {
    console.log('检查完成：未读取凭据、未连接 GitHub、未上传。');
    return;
  }
  const larkConfig = join(root, '.env.release.local');
  if (existsSync(larkConfig)) process.loadEnvFile(larkConfig);
  const webhook = process.env.LARK_WEBHOOK;
  if (webhook) validateWebhook(webhook);
  else console.warn('未配置 LARK_WEBHOOK，本次发布将跳过群通知。');
  if (git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('请先提交并推送已跟踪文件的修改，再发布 APK。');
  const remoteHeads = git(['ls-remote', 'origin', 'refs/heads/*']);
  if (!remoteHeads.split('\n').some(line => line.startsWith(`${commit}\t`))) {
    throw new Error('当前提交尚未推送到远端分支，请先 git push。');
  }
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    const credential = git(['credential', 'fill'], {
      input: 'protocol=https\nhost=github.com\n\n',
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    });
    token = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  }
  if (!token) throw new Error('未找到 GitHub 凭据，请先登录 Git，或设置 GH_TOKEN。');
  const api = async (url, { method = 'GET', json, bytes: upload, allow404 = false, binary = false } = {}) => {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`, Accept: binary ? 'application/octet-stream' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'starward',
        ...(json ? { 'Content-Type': 'application/json' } : {}),
        ...(upload ? { 'Content-Type': 'application/vnd.android.package-archive' } : {}),
      },
      body: upload || (json ? JSON.stringify(json) : undefined),
      signal: AbortSignal.timeout(upload || binary ? 600000 : 60000),
    });
    if (allow404 && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub 请求失败（HTTP ${response.status}），请检查账号的仓库写入权限和网络；可重试命令。`);
    if (response.status === 204) return null;
    if (binary) return Buffer.from(await response.arrayBuffer());
    return response.json();
  };
  const notesPath = join(root, 'RELEASE_NOTES.md');
  const notes = existsSync(notesPath) ? readFileSync(notesPath, 'utf8') : '';
  const result = await publishRelease({ api, repository, version, commit, filename, bytes, digest, notes });
  console.log(`发布完成：${result.release}\nAPK 下载：${result.download}`);
  if (webhook) {
    try {
      await notifyLark({
        webhook, secret: process.env.LARK_SIGNING_SECRET,
        appId: process.env.LARK_APP_ID, appSecret: process.env.LARK_APP_SECRET,
        version, actor: git(['log', '-1', '--pretty=format:%an']), notes, ...result,
      });
      console.log('Lark 发布通知已发送（含 APK 下载链接）。');
      if (!process.env.LARK_APP_ID) console.warn('未配置 LARK_APP_ID / LARK_APP_SECRET，通知中暂不显示二维码。');
    } catch (error) {
      console.error(`APK 已发布，但群通知失败：${error.message} 可重新运行 npm run release 重试通知；相同 APK 不会重复上传。`);
      process.exitCode = 1;
    }
  }
  try {
    const qr = await createReleaseQr(result.download, version);
    console.log(await QRCode.toString(result.download, { type: 'terminal', small: true }));
    console.log(`远程安装二维码：${qr.png}\n远程安装页面：${qr.html}`);
  } catch (error) {
    throw new Error(`APK 已发布，但生成二维码失败：${error.message}。可重新运行 npm run release 重试。`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`发布失败：${error.message}`); process.exitCode = 1; });
}
