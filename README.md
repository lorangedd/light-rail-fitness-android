# 轻铁训练 Android 发布页

<!-- 修改时间：2026-09-08 10:05:00 +08:00；目的：说明公开 APK 发布、校验和在线版本清单的安全使用方式。 -->

这里仅发布轻铁训练 Android 离线版的正式安装包与机器可读的版本清单。

## 下载与校验

请从 [Releases](../../releases) 下载最新 APK。安装前应核对 Release 页面及 `version.json` 中的 SHA-256。

当前版本为 `1.0.5`（versionCode `6`）：

- 包名：`cn.lightrail.fitnessokr`
- SHA-256：`C1392B2ADFCCECED6844C32B5DB00719BF199A08F92384BC4F3A3698774EBC90`
- 签名：APK Signature Scheme v2、v3

## 在线更新机制

客户端只会读取本仓库根目录的 [`version.json`](./version.json)。它不会上传训练数据，也不会静默安装 APK。发现较新版本后，仍由 Android 系统安装器向用户确认安装。

更新 APK 时，请先重新构建、验证签名并计算 SHA-256；再上传 Release 附件，最后同步更新 `version.json` 的版本号、下载地址和校验值。
