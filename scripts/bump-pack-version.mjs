import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function bumpPackVersion(root) {
  const packagePath = join(root, 'package.json');
  const lockPath = join(root, 'package-lock.json');
  const gradlePath = join(root, 'android/app/build.gradle');
  const packageText = readFileSync(packagePath, 'utf8');
  const lockText = readFileSync(lockPath, 'utf8');
  const gradleText = readFileSync(gradlePath, 'utf8');
  const pkg = JSON.parse(packageText);
  const lock = JSON.parse(lockText);
  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
  const code = /\bversionCode\s+(\d+)\b/.exec(gradleText);
  if (!version || !code || !/\bversionName\s+"[^"]+"/.test(gradleText) || !lock.packages?.['']) {
    throw new Error('版本配置不完整：需要 x.y.z 格式的 package 版本和 Android versionCode/versionName。');
  }
  const patch = Number(version[3]) + 1;
  const versionCode = Number(code[1]) + 1;
  if (!Number.isSafeInteger(patch) || !Number.isSafeInteger(versionCode) || versionCode > 2100000000) {
    throw new Error('版本号已超出可递增范围。');
  }
  const previousVersion = pkg.version;
  pkg.version = `${version[1]}.${version[2]}.${patch}`;
  lock.version = pkg.version;
  lock.packages[''].version = pkg.version;
  const gradle = gradleText
    .replace(/\bversionCode\s+\d+\b/, `versionCode ${versionCode}`)
    .replace(/\bversionName\s+"[^"]+"/, `versionName "${pkg.version}"`);
  const serialize = (value, original) => {
    const indent = original.match(/\n([ \t]+)"/)?.[1] || '    ';
    return (JSON.stringify(value, null, indent) + '\n').replace(/\n/g, original.includes('\r\n') ? '\r\n' : '\n');
  };
  writeFileSync(packagePath, serialize(pkg, packageText));
  writeFileSync(lockPath, serialize(lock, lockText));
  writeFileSync(gradlePath, gradle);
  return { previousVersion, version: pkg.version, versionCode };
}
