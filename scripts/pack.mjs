import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { createInstallQr } from './apk-install-qr.mjs';
import { bumpPackVersion } from './bump-pack-version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const windows = process.platform === 'win32';
const env = { ...process.env };
env.BUILD_TARGET = 'android';
// Isolate this project's downloads/settings from stale global Gradle proxies.
// An explicit GRADLE_USER_HOME still lets callers choose their own configuration.
env.GRADLE_USER_HOME ||= join(root, '.gradle-user-home');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`构建失败（退出码 ${result.status ?? result.signal}），请查看上方错误。`);
}

function findJava() {
  const candidates = [
    env.JAVA_HOME && join(env.JAVA_HOME, 'bin', windows ? 'java.exe' : 'java'),
    windows && join(env.ProgramFiles || 'C:/Program Files', 'Android/Android Studio/jbr/bin/java.exe'),
    process.platform === 'darwin' && '/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java',
    'java',
  ].filter(Boolean);
  for (const command of candidates) {
    const result = spawnSync(command, ['-XshowSettings:properties', '-version'], { encoding: 'utf8' });
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const major = Number(output.match(/java\.version\s*=\s*(\d+)/)?.[1]);
    const javaHome = output.match(/java\.home\s*=\s*([^\r\n]+)/)?.[1]?.trim();
    if (result.status === 0 && major >= 21 && major <= 24 && javaHome && existsSync(join(javaHome, 'bin', windows ? 'javac.exe' : 'javac'))) {
      env.JAVA_HOME = javaHome;
      console.log(`Java ${major}: ${javaHome}`);
      return;
    }
  }
  throw new Error('未找到兼容的 JDK。请安装 JDK 21 并设置 JAVA_HOME，参见 APK_BUILD_GUIDE.md。');
}

try {
  const version = bumpPackVersion(root);
  console.log(`版本递增：${version.previousVersion} → ${version.version}（Android versionCode ${version.versionCode}）`);
  findJava();
  console.log(`Gradle 配置与缓存：${env.GRADLE_USER_HOME}`);
  // Keep an explicitly configured SDK or local.properties; otherwise use the standard installation.
  if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT && !existsSync(join(root, 'android/local.properties'))) {
    const sdk = windows
      ? join(env.LOCALAPPDATA || join(homedir(), 'AppData/Local'), 'Android/Sdk')
      : join(homedir(), process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk');
    if (!existsSync(sdk)) throw new Error('未找到 Android SDK，请设置 ANDROID_HOME，参见 APK_BUILD_GUIDE.md。');
    env.ANDROID_HOME = sdk;
  }

  console.log('\n[1/3] 构建网页');
  // npm supplies its CLI path, avoiding platform-specific shell quoting and npm.cmd.
  if (!env.npm_execpath) throw new Error('请通过 npm run pack 运行此脚本。');
  run(process.execPath, [env.npm_execpath, 'run', 'build']);

  console.log('\n[2/3] 同步 Android 资源');
  run(process.execPath, [join(root, 'node_modules/@capacitor/cli/bin/capacitor'), 'sync', 'android']);

  console.log('\n[3/3] 生成可安装 APK（首次运行需要下载 Gradle / Android 依赖）');
  if (windows) {
    run(env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'gradlew.bat --no-daemon --console=plain assembleDebug'], join(root, 'android'));
  } else {
    run('sh', ['./gradlew', '--no-daemon', '--console=plain', 'assembleDebug'], join(root, 'android'));
  }

  const source = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
  if (!existsSync(source) || statSync(source).size === 0) throw new Error('Gradle 未生成有效的 APK。');
  const destination = join(root, `release/starward-v${version.version}.apk`);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  // Keep the stable download URL used by existing LAN QR codes working.
  copyFileSync(source, join(root, 'release/starward.apk'));
  console.log(`\n打包成功：${destination}\n大小：${(statSync(destination).size / 1024 / 1024).toFixed(1)} MB\n将 APK 复制到安卓手机，点击文件即可安装。`);
  try {
    await createInstallQr();
  } catch (error) {
    console.error(`APK 已打包成功，但二维码分享未就绪：${error.message}\n可运行 npm run share 重试，无需重新打包。`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`\n打包失败：${error.message}\n本次没有发布新的 APK；release 中如有旧包，不代表本次构建成功。`);
  process.exitCode = 1;
}
