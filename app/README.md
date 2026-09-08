# 轻铁训练 Android 源码

<!-- 修改时间：2026-09-08 11:00:00 +08:00；目的：说明公开源码的构建边界，防止签名材料、用户数据和构建缓存被误提交。 -->

这是离线优先 Android 应用的可审查源码。Web 页面位于 `www/`，原生 Android 容器位于 `android/`。

## 本地开发

1. 安装 Node.js、JDK 21 与 Android SDK。
2. 在此目录执行 `npm install`。
3. 执行 `npm run android:sync`，然后在 `android/` 中使用 Gradle 或 Android Studio 构建。

正式签名所需的 keystore、密码、Android 本地 SDK 路径、训练数据和构建产物均不会提交到本仓库。

## 在线版本检查

应用只在用户点击“检查版本更新”时读取仓库根目录的 `version.json`。它校验包名、版本号、固定 GitHub Release 路径和 SHA-256 格式；下载页由 Android 系统浏览器打开，安装仍由用户确认。
