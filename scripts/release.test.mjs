import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { publishRelease, parseRepository, createReleaseQr } from './release.mjs';

const input = { repository: 'owner/repo', version: '1.2.3', commit: 'abc', filename: 'starward-v1.2.3.apk', bytes: Buffer.from('apk'), digest: 'hash' };
const asset = { name: input.filename, size: 3, digest: 'sha256:hash', browser_download_url: 'https://github.com/owner/repo/releases/download/v1.2.3/starward-v1.2.3.apk' };
const draft = { id: 1, draft: true, tag_name: 'v1.2.3', upload_url: 'https://uploads.github.com/repos/owner/repo/releases/1/assets{?name,label}', html_url: 'https://github.com/owner/repo/releases/tag/v1.2.3' };

test('creates draft, uploads verified APK, then publishes', async () => {
  const calls = [];
  const results = [null, [], draft, [], { ...asset, browser_download_url: 'https://github.com/owner/repo/releases/download/untagged-temporary/file.apk' }, { ...draft, draft: false }];
  const api = async (url, options = {}) => { calls.push({ url, ...options }); return results.shift(); };
  const result = await publishRelease({ ...input, api });
  assert.equal(result.download, asset.browser_download_url);
  assert.equal(calls[2].json.draft, true);
  assert.equal(calls[4].bytes, input.bytes);
  assert.deepEqual(calls[5].json, { draft: false });
});

test('repeat release with identical APK performs no writes', async () => {
  const api = async (url, options = {}) => {
    assert.equal(options.method, undefined);
    return url.includes('/assets?') ? [asset] : { ...draft, draft: false };
  };
  assert.equal((await publishRelease({ ...input, api })).download, asset.browser_download_url);
});

test('conflicting APK is not replaced or published', async () => {
  const api = async (url, options = {}) => {
    assert.equal(options.method, undefined);
    return url.includes('/assets?') ? [{ ...asset, digest: 'sha256:other' }] : draft;
  };
  await assert.rejects(publishRelease({ ...input, api }), /不会覆盖/);
});

test('failed upload leaves draft unpublished and can be resumed', async () => {
  const results = [null, [draft], []];
  const api = async (url, options = {}) => {
    assert.notEqual(options.method, 'PATCH');
    if (options.bytes) throw new Error('upload failed');
    return results.shift();
  };
  await assert.rejects(publishRelease({ ...input, api }), /upload failed/);
});

test('repository parsing and remote QR output', async () => {
  assert.equal(parseRepository('https://github.com/owner/repo.git'), 'owner/repo');
  assert.equal(parseRepository('git@github.com:owner/repo.git'), 'owner/repo');
  assert.throws(() => parseRepository('https://example.com/owner/repo.git'));
  const output = mkdtempSync(join(tmpdir(), 'release-qr-'));
  try {
    const files = await createReleaseQr(asset.browser_download_url, '1.2.3', output);
    assert.equal(readFileSync(files.png).subarray(1, 4).toString(), 'PNG');
    const html = readFileSync(files.html, 'utf8');
    assert.ok(html.includes(asset.browser_download_url));
    assert.ok(!html.includes('localhost'));
    await assert.rejects(createReleaseQr('https://example.com/file.apk', '1.2.3', output));
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test('interrupted starter asset in a draft is removed before retry', async () => {
  const calls = [];
  const results = [draft, [{ ...asset, id: 9, state: 'starter', digest: null }], null, { ...asset, state: 'uploaded' }, { ...draft, draft: false }];
  const api = async (url, options = {}) => { calls.push({ url, ...options }); return results.shift(); };
  await publishRelease({ ...input, api });
  assert.equal(calls[2].method, 'DELETE');
  assert.ok(calls[2].url.endsWith('/assets/9'));
  assert.equal(calls[3].bytes, input.bytes);
  assert.deepEqual(calls[4].json, { draft: false });
});

test('starter asset in a published release is never deleted', async () => {
  const api = async (url, options = {}) => {
    assert.equal(options.method, undefined);
    return url.includes('/assets?') ? [{ ...asset, state: 'starter' }] : { ...draft, draft: false };
  };
  await assert.rejects(publishRelease({ ...input, api }), /已发布版本/);
});

test('missing digest is verified from downloaded bytes without overwriting', async () => {
  const digest = createHash('sha256').update(input.bytes).digest('hex');
  let downloads = 0;
  const api = async (url, options = {}) => {
    assert.equal(options.method, undefined);
    if (options.binary) { downloads++; return input.bytes; }
    return url.includes('/assets?') ? [{ ...asset, id: 9, digest: null }] : { ...draft, draft: false };
  };
  await publishRelease({ ...input, digest, api });
  assert.equal(downloads, 1);
  await assert.rejects(publishRelease({ ...input, digest: 'different', api }), /不会覆盖/);
});
