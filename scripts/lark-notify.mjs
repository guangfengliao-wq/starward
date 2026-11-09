import QRCode from 'qrcode';
import { createHmac } from 'node:crypto';

export function validateWebhook(webhook) {
  let url;
  try { url = new URL(webhook); } catch { throw new Error('LARK_WEBHOOK 地址无效。'); }
  if (url.origin !== 'https://open.larksuite.com' || !/^\/open-apis\/bot\/v2\/hook\/[\w-]+$/.test(url.pathname) || url.search || url.hash || url.username || url.password) {
    throw new Error('LARK_WEBHOOK 必须是 Lark 自定义机器人的 HTTPS Webhook 地址。');
  }
  return url.href;
}

export function createReleaseCard({ version, actor, notes, release, download, imageKey }) {
  return {
    msg_type: 'interactive',
    card: {
      header: { title: { tag: 'plain_text', content: `✅ 繁星发布成功：v${version}` }, template: 'green' },
      elements: [
        { tag: 'div', text: { tag: 'plain_text', content: `发布人：${actor}\n版本：v${version}` } },
        { tag: 'div', text: { tag: 'plain_text', content: `更新内容：\n${(notes.trim() || '本次版本未填写更新说明。').slice(0, 4000)}` } },
        { tag: 'div', text: { tag: 'plain_text', content: '下载 APK 后使用相同签名覆盖安装，可保留应用数据。下载需要能访问 GitHub；私有仓库需要相应权限。' } },
        ...(imageKey ? [
          { tag: 'div', text: { tag: 'plain_text', content: '扫码下载本次版本 APK：' } },
          { tag: 'img', img_key: imageKey, alt: { tag: 'plain_text', content: `繁星 v${version} APK 下载二维码` }, mode: 'fit_horizontal', custom_width: 278, compact_width: true, preview: true },
        ] : []),
        { tag: 'hr' },
        { tag: 'action', actions: [
          { tag: 'button', text: { tag: 'plain_text', content: '📥 下载 APK' }, url: download, type: 'primary' },
          { tag: 'button', text: { tag: 'plain_text', content: '查看发布详情' }, url: release, type: 'default' },
        ] },
      ],
    },
  };
}

export async function notifyLark({ webhook, secret, appId, appSecret, fetchImpl = fetch, ...details }) {
  const url = validateWebhook(webhook);
  if (Boolean(appId) !== Boolean(appSecret)) throw new Error('二维码配置不完整，请同时配置 LARK_APP_ID 和 LARK_APP_SECRET。');
  const imageKey = appId ? await uploadDownloadQr({ appId, appSecret, download: details.download, fetchImpl }) : undefined;
  const payload = createReleaseCard({ ...details, imageKey });
  if (secret) {
    payload.timestamp = String(Math.floor(Date.now() / 1000));
    payload.sign = createHmac('sha256', `${payload.timestamp}\n${secret}`).update('').digest('base64');
  }
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
  } catch {
    throw new Error('Lark 通知请求失败或超时，请检查网络和机器人配置。');
  }
  if (!response.ok) throw new Error(`Lark 通知失败（HTTP ${response.status}）。`);
  let result;
  try { result = await response.json(); } catch { throw new Error('Lark 返回了无效响应。'); }
  const code = result.code ?? result.StatusCode;
  if (code !== 0) throw new Error(`Lark 拒绝了通知（错误码：${typeof code === 'number' ? code : '未知'}），请检查机器人安全设置。`);
}

export async function uploadDownloadQr({ appId, appSecret, download, fetchImpl = fetch }) {
  const url = new URL(download);
  if (url.origin !== 'https://github.com' || !url.pathname.includes('/releases/download/')) {
    throw new Error('二维码必须指向 GitHub Release 的 APK 下载地址。');
  }
  const request = async (path, options, label) => {
    let response;
    try {
      response = await fetchImpl('https://open.larksuite.com/open-apis/' + path, {
        ...options, method: 'POST', signal: AbortSignal.timeout(30000), redirect: 'error',
      });
    } catch {
      throw new Error(`${label}请求失败或超时，请检查网络。`);
    }
    if (!response.ok) throw new Error(`${label}失败（HTTP ${response.status}）。`);
    let result;
    try { result = await response.json(); } catch { throw new Error(`${label}返回了无效响应。`); }
    if (result.code !== 0) {
      throw new Error(`${label}失败（错误码：${typeof result.code === 'number' ? result.code : '未知'}），请检查应用凭据、机器人能力及图片上传权限。`);
    }
    return result;
  };
  const auth = await request('auth/v3/tenant_access_token/internal', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  }, 'Lark 应用认证');
  if (typeof auth.tenant_access_token !== 'string' || !auth.tenant_access_token) throw new Error('Lark 未返回应用访问令牌。');
  const png = await QRCode.toBuffer(url.href, { errorCorrectionLevel: 'M', margin: 4, width: 640 });
  const form = new FormData();
  form.set('image_type', 'message');
  form.set('image', new Blob([png], { type: 'image/png' }), 'apk-download-qr.png');
  const upload = await request('im/v1/images', {
    headers: { Authorization: `Bearer ${auth.tenant_access_token}` },
    body: form,
  }, 'Lark 二维码上传');
  if (typeof upload.data?.image_key !== 'string' || !upload.data.image_key) throw new Error('Lark 未返回二维码图片标识。');
  return upload.data.image_key;
}