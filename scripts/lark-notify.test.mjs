import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { notifyLark, validateWebhook } from './lark-notify.mjs';

const details = {
  webhook: 'https://open.larksuite.com/open-apis/bot/v2/hook/test-hook',
  version: '0.1.7', actor: '测试作者', notes: '新增自定义默写',
  release: 'https://github.com/owner/repo/releases/tag/v0.1.7',
  download: 'https://github.com/owner/repo/releases/download/v0.1.7/starward-v0.1.7.apk',
};

test('notification includes version, notes and exact versioned APK link', async () => {
  let calls = 0;
  await notifyLark({ ...details, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, details.webhook);
    assert.equal(options.method, 'POST');
    const message = JSON.parse(options.body);
    assert.equal(message.msg_type, 'interactive');
    assert.ok(message.card.header.title.content.includes('v0.1.7'));
    assert.ok(JSON.stringify(message).includes(details.notes));
    assert.equal(message.card.elements.at(-1).actions[0].url, details.download);
    assert.equal(message.card.elements.at(-1).actions[1].url, details.release);
    assert.equal(message.sign, undefined);
    return { ok: true, json: async () => ({ code: 0 }) };
  } });
  assert.equal(calls, 1);
});

test('optional signing uses timestamp and secret', async () => {
  await notifyLark({ ...details, secret: 'test-secret', fetchImpl: async (_, options) => {
    const message = JSON.parse(options.body);
    assert.equal(message.sign, createHmac('sha256', message.timestamp + '\ntest-secret').update('').digest('base64'));
    return { ok: true, json: async () => ({ StatusCode: 0 }) };
  } });
});

test('HTTP errors, API rejection and malformed responses fail explicitly', async () => {
  for (const response of [
    { ok: false, status: 403 },
    { ok: true, json: async () => ({ code: 19024 }) },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => { throw new Error('invalid JSON'); } },
  ]) {
    await assert.rejects(notifyLark({ ...details, fetchImpl: async () => response }), /Lark/);
  }
});

test('network errors do not expose the webhook', async () => {
  await assert.rejects(
    notifyLark({ ...details, fetchImpl: async () => { throw new Error(details.webhook); } }),
    error => !error.message.includes(details.webhook) && /请求失败/.test(error.message),
  );
});

test('invalid webhook rejected before requesting', async () => {
  for (const webhook of ['http://open.larksuite.com/open-apis/bot/v2/hook/x', 'https://example.com/hook/x', details.webhook + '?secret=x']) {
    assert.throws(() => validateWebhook(webhook), /LARK_WEBHOOK/);
  }
});

test('uploads locally generated PNG and embeds image key before sending webhook', async () => {
  const calls = [];
  await notifyLark({ ...details, appId: 'cli_test', appSecret: 'app-secret', fetchImpl: async (url, options) => {
    calls.push(url);
    if (url.endsWith('/tenant_access_token/internal')) {
      assert.deepEqual(JSON.parse(options.body), { app_id: 'cli_test', app_secret: 'app-secret' });
      return { ok: true, json: async () => ({ code: 0, tenant_access_token: 'token-test' }) };
    }
    if (url.endsWith('/im/v1/images')) {
      assert.equal(options.headers.Authorization, 'Bearer token-test');
      assert.equal(options.body.get('image_type'), 'message');
      const file = options.body.get('image');
      assert.equal(file.type, 'image/png');
      const png = Buffer.from(await file.arrayBuffer());
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), 640);
      return { ok: true, json: async () => ({ code: 0, data: { image_key: 'img_test_qr' } }) };
    }
    assert.equal(url, details.webhook);
    const card = JSON.parse(options.body).card;
    assert.equal(card.elements.find(item => item.tag === 'img').img_key, 'img_test_qr');
    assert.equal(card.elements.at(-1).actions[0].url, details.download);
    assert.ok(!options.body.includes('app-secret'));
    assert.ok(!options.body.includes('token-test'));
    return { ok: true, json: async () => ({ code: 0 }) };
  } });
  assert.equal(calls.length, 3);
});

test('incomplete app configuration does not send notification', async () => {
  for (const config of [{ appId: 'cli_test' }, { appSecret: 'secret' }]) {
    await assert.rejects(notifyLark({ ...details, ...config, fetchImpl: async () => assert.fail('Unexpected request') }), /配置不完整/);
  }
});

test('failed authentication or image upload does not send a misleading success card', async () => {
  for (const authFails of [true, false]) {
    let requests = 0;
    await assert.rejects(notifyLark({
      ...details, appId: 'cli_test', appSecret: 'secret',
      fetchImpl: async (url) => {
        requests++;
        assert.notEqual(url, details.webhook);
        if (!authFails && url.endsWith('/tenant_access_token/internal')) {
          return { ok: true, json: async () => ({ code: 0, tenant_access_token: 'test-token' }) };
        }
        return { ok: true, json: async () => ({ code: 99991672 }) };
      },
    }), /失败/);
    assert.equal(requests, authFails ? 1 : 2);
  }
});
