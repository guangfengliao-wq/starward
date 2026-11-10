import QRCode from 'qrcode';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = new URL('..', import.meta.url);
const output = new URL('../release/', import.meta.url);
const port = 5181;

export function getShareAddress(interfaces = networkInterfaces()) {
  const candidates = Object.entries(interfaces).flatMap(([name, entries]) =>
    (entries ?? []).filter(entry => entry.family === 'IPv4' && !entry.internal)
      .map(entry => ({ name, address: entry.address })));
  if (process.env.APK_SHARE_HOST) {
    if (!candidates.some(item => item.address === process.env.APK_SHARE_HOST)) throw new Error('APK_SHARE_HOST 必须是本机 IPv4 地址。');
    return process.env.APK_SHARE_HOST;
  }
  const local = candidates.filter(({ name, address }) =>
    !/vmware|virtual|vbox|hyper-v|vethernet|vpn|tun|tap|meta|clash|wsl|docker/i.test(name)
    && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address));
  local.sort((a, b) => Number(/wi-fi|wlan|无线/i.test(b.name)) - Number(/wi-fi|wlan|无线/i.test(a.name)));
  if (!local.length) throw new Error('未找到局域网地址，请连接 Wi-Fi 或网线后运行 npm run share。');
  return local[0].address;
}

async function checkService() {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) });
    const data = await response.json();
    return data.service === 'starward-apk' && data.root === root.href;
  } catch { return false; }
}

export async function createInstallQr() {
  const address = getShareAddress();
  const url = `http://${address}:${port}/`;
  mkdirSync(output, { recursive: true });
  if (!await checkService()) {
    const log = openSync(new URL('apk-share.log', output), 'a');
    const child = spawn(process.execPath, [fileURLToPath(new URL('./share-apk.mjs', import.meta.url))], {
      cwd: fileURLToPath(root), detached: true, windowsHide: true, stdio: ['ignore', log, log]
    });
    child.on('error', error => console.error(`下载服务启动失败：${error.message}`));
    child.unref();
    closeSync(log);
    let ready = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await checkService()) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ready) throw new Error(`下载服务未启动，请检查端口 ${port} 和 release/apk-share.log。`);
  }
  const options = { errorCorrectionLevel: 'M', margin: 4, width: 480 };
  await QRCode.toFile(fileURLToPath(new URL('install-qr.png', output)), url, options);
  const image = await QRCode.toDataURL(url, options);
  writeFileSync(new URL('install.html', output), `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>扫码安装</title><style>body{font:16px system-ui;text-align:center;background:#eeedff;color:#45405e;padding:24px}main{max-width:520px;margin:auto;background:white;padding:32px;border-radius:24px}img{max-width:100%;height:auto}a{color:#667eea}p{line-height:1.8}</style><main><h1>扫码安装繁星</h1><p>手机与电脑连接同一 Wi-Fi<br>扫码下载 APK，再按系统提示安装</p><img src="${image}" alt="安装二维码"><p><a href="${url}">${url}</a></p><p>保持电脑开机。更新时直接覆盖安装。<br>若 Windows 提示防火墙权限，请允许专用网络访问。</p></main></html>`, 'utf8');
  console.log('\n用手机扫码安装（电脑和手机需在同一局域网）：');
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  console.log(`下载地址：${url}\n二维码：${fileURLToPath(new URL('install-qr.png', output))}\n安装页面：${fileURLToPath(new URL('install.html', output))}\n下载服务后台运行；后续打包自动提供最新 APK。`);
  return url;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createInstallQr().catch(error => { console.error(error.message); process.exitCode = 1; });
}
