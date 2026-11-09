import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { networkInterfaces } from 'node:os';

const apk = new URL('../release/starward.apk', import.meta.url);
const port = 5181;
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ service: 'starward-apk', root: new URL('..', import.meta.url).href }));
    return;
  }
  if (!['/', '/starward.apk'].includes(path)) { res.writeHead(404); res.end(); return; }
  let info;
  try { info = statSync(apk); } catch { res.writeHead(503); res.end('Run npm run pack first.'); return; }
  res.setHeader('Cache-Control', 'no-store');
  if (path === '/starward.apk') {
    res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="starward.apk"', 'Content-Length': info.size });
    if (req.method === 'HEAD') res.end();
    else { const stream = createReadStream(apk); stream.on('error', () => res.destroy()); stream.pipe(res); }
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>安装繁星</title><style>body{font:16px system-ui;background:linear-gradient(135deg,#667eea,#764ba2);min-height:100vh;margin:0;display:grid;place-items:center;color:#45405e}main{margin:24px;padding:32px;max-width:460px;background:white;border-radius:24px}h1{font-size:26px}p{line-height:1.8;color:#777}a{display:block;padding:16px;background:#667eea;color:white;border-radius:12px;text-align:center;text-decoration:none;font-weight:bold}</style><main><h1>繁星</h1><p>安卓手机安装包 · ${(info.size / 1024 / 1024).toFixed(1)} MB<br>更新：${info.mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</p><a href="/starward.apk">下载并安装 APK</a><p>下载完成后打开文件，按系统提示允许浏览器安装应用。更新时直接覆盖安装，可保留原有应用数据。</p></main></html>`);
});
server.on('error', error => { console.error(error.message); process.exit(1); });
server.listen(port, '0.0.0.0', () => {
  console.log('APK download page running. Ctrl+C to stop.');
  for (const items of Object.values(networkInterfaces())) for (const item of items ?? []) {
    if (item.family === 'IPv4' && !item.internal) console.log(`http://${item.address}:${port}`);
  }
});
