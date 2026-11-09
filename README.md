# 繁星 · Starward

繁星是面向手机的星空观测应用。Starward 意为「朝向星辰」。

项目参照单词本的 Vue 3、TypeScript、Vite 和 Capacitor 结构。观测页在 `src/pages/Observation.vue`，共享样式在 `src/assets/styles.css`，Android 原生工程在 `android/`。

## 本地开发

```powershell
npm ci
npm run dev
```

同一局域网内的手机可以通过 `npm run dev -- --host 0.0.0.0` 输出的 Network 地址预览界面。

```powershell
npm run build
npm run android:sync
npm run android:open
```

Android 工程需要配置 Android SDK 36 和 JDK 21 或兼容的更高版本。

## 打包与发布

`npm run pack` 递增补丁版本和 Android `versionCode`，同步网页、npm 与 Android 的版本号，并构建调试签名 APK。成功后生成 `release/starward-v<版本号>.apk` 和固定名称的 `release/starward.apk`，同时输出局域网安装二维码。首页右下角显示构建时的版本号。

`npm run share` 可以重新生成局域网二维码。`npm run release -- --dry-run` 检查当前 APK 与 Git 仓库信息。`npm run release` 将当前 APK 发布到本项目 GitHub `origin` 的 Releases，需要先提交并推送版本变更。Lark 通知通过本项目独立的 `.env.release.local` 配置，变量沿用 `LARK_WEBHOOK`、`LARK_SIGNING_SECRET`、`LARK_APP_ID` 和 `LARK_APP_SECRET`。

首次安装和环境配置见 [APK 打包指南](APK_BUILD_GUIDE.md)。

## 太阳系

地面视角在拖动或缩放结束后显示恒星标注。常见中文名优先，其次使用 [IAU 专名与 HIP 编号对照数据](https://github.com/cyschneck/iau-star-names/blob/main/iau_proper_stars.csv) 提取的匹配专名，其余显示 HIP 编号。放大时会逐步放宽编号标签的星等上限，拥挤处优先显示专名和亮星。

「地面仰望」视角用 ESA Hipparcos 星表绘制离线恒星层。`src/assets/hipparcos-bright.json` 来自 [Greg Miller 的 J2000 子集](https://github.com/gmiller123456/hip2000/blob/master/hipparcos_6.5.js)，保留有效且 Johnson V 星等不超过 6.5 的记录。每行依次是 HIP 编号、赤经（度）、赤纬（度）、视星等。当前地面观测方向为示意，尚未按地点、时间或设备朝向校准。

观测页底部的「真实比例」开关使用统一尺度绘制太阳、行星球体和轨道距离。行星采用 [JPL 平均半径](https://ssd.jpl.nasa.gov/planets/phys_par.html) 和 [NASA 行星资料表](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) 中的轨道距离，太阳采用 695,700 公里的名义半径。轨道仍简化为圆，行星位置为示意。全景下行星可能小于一个像素，可用标签定位。

观测页通过 `SolarSystem.vue` 显示以太阳为中心的三维太阳系，`solarRenderer.ts` 使用 Three.js 和 WebGL 2 绘制八大行星、轨道和土星环。拖动可旋转，双指捏合或滚轮可缩放。默认视图中的行星大小、轨道距离和位置均为示意。

首次准备贴图时运行 `npm run textures:fetch`。脚本从 Solar System Scope 下载太阳、八大行星和银河背景的 2K 贴图及土星环 PNG，遇到连接或下载错误会自动尝试 Simple Space Data Mirror。也可以从[镜像下载页](https://www.simplespacedata.org/)下载 `src/assets/planet-textures/sources.json` 中列出的文件，保留原文件名并放到同目录。运行 `npm run textures:check` 检查文件。

网页和 APK 从本地资源加载贴图。开发时缺少贴图的天体保留纯色外观，`npm run pack` 会在递增版本前检查贴图是否齐备。贴图署名和许可见观测页的「关于 · 贴图来源」。

银河背景同时打包 8K 和 2K 贴图。设备支持 8192 像素纹理时优先加载 8K，尺寸受限或加载失败时回退到 2K。8K 原图也可从 [GitHub 镜像](https://github.com/smithcg1/DigitalSolarSystem/blob/master/8k_stars_milky_way.jpg) 下载。
