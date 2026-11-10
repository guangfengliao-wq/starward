import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bumpPackVersion } from './bump-pack-version.mjs';

test('pack increments patch and Android code on each run, preserving dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'pack-version-'));
  try {
    mkdirSync(join(root, 'android/app'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '0.1.9' }));
    writeFileSync(join(root, 'package-lock.json'), JSON.stringify({ version: '0.1.9', packages: { '': { version: '0.1.9' }, 'node_modules/example': { version: '2.0.0' } } }));
    writeFileSync(join(root, 'android/app/build.gradle'), 'versionCode 7\nversionName "1.0"\n');
    assert.deepEqual(bumpPackVersion(root), { previousVersion: '0.1.9', version: '0.1.10', versionCode: 8 });
    assert.deepEqual(bumpPackVersion(root), { previousVersion: '0.1.10', version: '0.1.11', versionCode: 9 });
    const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
    assert.equal(lock.version, '0.1.11');
    assert.equal(lock.packages[''].version, '0.1.11');
    assert.equal(lock.packages['node_modules/example'].version, '2.0.0');
    assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, '0.1.11');
    assert.match(readFileSync(join(root, 'android/app/build.gradle'), 'utf8'), /versionCode 9\nversionName "0.1.11"/);
    writeFileSync(join(root, 'android/app/build.gradle'), 'invalid config');
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    assert.throws(() => bumpPackVersion(root), /版本配置不完整/);
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
