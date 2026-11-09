# Android APK 一键打包

首次打包前先在可联网的终端运行 `npm run textures:fetch`，准备太阳、八颗行星、土星环和银河背景贴图。贴图齐备后可离线构建网页资源。

在项目根目录运行：

```bash
npm run pack
```

每次执行时会先将版本号最后一位加 1（例如 `0.1.0 → 0.1.1`），同步更新 `package.json`、`package-lock.json` 和 Android `versionName`，同时将 `versionCode` 加 1。即使后续构建失败也保留此次递增。首页右下角显示本次构建的版本号；单独执行 `npm run build` 或 `npm run share` 不递增版本。

命令依次构建网页、同步 Capacitor Android 资源、执行 Gradle `assembleDebug`，成功后输出：

```text
release/starward-v<版本号>.apk
```

例如版本 `0.1.1` 会生成 `release/starward-v0.1.1.apk`，方便上传到 GitHub Releases 和区分历史安装包。同时保留 `release/starward.apk` 作为最新成功构建的副本，兼容已有局域网下载链接和安装命令。

这是自动使用本机调试密钥签名的 APK，可直接安装到家庭安卓手机，无需连接开发服务器。每次修改应用后重新运行同一命令即可；只有网页构建与 Gradle 打包成功后才会更新 APK。失败时请查看终端错误，旧 APK 不代表本次构建结果。

## 首次准备

- 安装 Node.js 22 或更高版本，并在项目根目录运行 `npm install`。
- 安装 JDK 21（推荐）。脚本依次检查 `JAVA_HOME`、Android Studio 自带 JDK 和 PATH 中的 Java，选择兼容的 JDK 21–24，仅对当前打包进程生效。
- 安装 Android SDK。在 Android Studio 的 SDK Manager 中安装 Android 16 / API 36、Android SDK Build-Tools 35.0.0 和 Android SDK Platform-Tools，并接受相应许可。
- 脚本优先使用 `ANDROID_HOME`、`ANDROID_SDK_ROOT` 或 `android/local.properties` 中的配置；未配置时会尝试系统默认 SDK 安装目录。
- 首次打包需要联网下载 Gradle 8.14.3 和 Maven 依赖，耗时取决于网络速度。SDK 缺少组件时，Gradle 可能在已接受许可的前提下自动下载。
- 打包默认使用项目内 `.gradle-user-home/` 保存 Gradle 缓存与配置，避免继承电脑全局失效的代理。已显式设置 `GRADLE_USER_HOME` 时则使用指定目录。下载使用较小的 Gradle `bin` 分发包，后续打包复用缓存。

Windows PowerShell 中可按实际路径配置当前终端：

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-21'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
npm run pack
```

Android 配置与项目当前安装的 Capacitor 8 模板保持一致，最低支持 Android 7.0 / API 24。版本要求参考 [Capacitor 8 迁移指南](https://capacitorjs.com/docs/updating/8-0)。

## 安装到手机

运行 `npm run pack` 成功后，会自动启动或复用局域网 APK 下载服务，并输出终端二维码，同时生成：

- `release/install-qr.png`：手机扫码用的二维码。
- `release/install.html`：在电脑打开的二维码安装页面。

电脑和手机需在同一局域网，保持电脑开机。用手机扫码打开下载页，下载 APK 后按系统提示安装即可。Windows 若弹出防火墙提示，请允许专用网络访问。每次新打包都会提供最新 APK，无需拷贝文件；使用相同签名覆盖安装可保留记录。

电脑重启或网络地址变化后，运行 `npm run share` 可重新启动服务、生成二维码，无需重新打包。默认端口为 `5181`，日志位于 `release/apk-share.log`；脚本会排除常见虚拟网卡。多网卡时可设置 `APK_SHARE_HOST` 为本机的实际局域网 IPv4 地址。

1. 将 `release/starward.apk` 通过 USB 文件传输等方式复制到安卓手机。
2. 在手机文件管理器中点击 APK，按提示允许该文件管理器“安装未知应用”，完成安装。
3. 打开“繁星”。

也可以在开启 USB 调试并授权电脑后运行：

```bash
adb install -r release/starward.apk
```

以后使用同一台电脑、同一调试签名生成的 APK 可以覆盖安装，通常会保留应用数据。保留本机 `~/.android/debug.keystore`；换电脑打包时应继续使用同一密钥，以免签名不同导致无法覆盖安装。不要为了更新随意卸载旧应用，卸载会清除应用本地数据。

## 发布到 GitHub Releases

本地打包与局域网分享不会上传 APK。需要远程发布时，先 `npm run pack`，提交并推送版本及代码修改，再运行 `npm run release`。

发布命令上传当前版本的 `release/starward-v<版本号>.apk`，不打包、不递增版本。成功后生成指向 GitHub APK 下载地址的 `release/github-install-v<版本号>.png`、`.html`，并在终端显示二维码。扫码设备需联网访问 GitHub，无需与电脑处于同一局域网。

运行 `npm run release -- --dry-run` 可仅检查本地文件。登录与重复发布说明见 [README](README.md#发布-apk-到-github)。

## 常见问题

- **提示找不到 JDK / SDK**：按上面的首次准备配置环境；JDK 17 不能编译本项目所需的 Java 21 源码。
- **Gradle 下载超时或 Maven 依赖下载失败**：确认电脑能访问 `services.gradle.org`、Google Maven 和 Maven Central；需要代理时，在终端打印的 Gradle 配置目录下创建 `gradle.properties`，设置可用的 `systemProp.http.proxyHost`、`systemProp.http.proxyPort`、`systemProp.https.proxyHost` 和 `systemProp.https.proxyPort`。
- **`Unexpected end of file from server`**：旧的全局 Gradle 代理已通过项目独立配置目录避开。如果仍出现错误，检查是否显式设置了 `GRADLE_USER_HOME`，以及该目录的代理设置是否有效。
- **SDK 许可未接受 / API 36 未安装**：在 Android Studio SDK Manager 中完成安装和许可确认后重试。
- **安装提示签名冲突**：使用原来打包电脑的签名密钥重新生成 APK。

此命令用于个人安装，输出调试 APK。应用商店发布需要另行配置正式发布签名。
