# 轻铁训练 Android 发布页

<!-- 修改时间：2026-09-11 10:30:00 +08:00；目的：更新 v1.0.15 本地表单草稿暂存说明。 -->

这里仅发布轻铁训练 Android 离线版的正式安装包与机器可读的版本清单。

## 下载与校验

请从 [Releases](../../releases) 下载最新 APK。安装前应核对 Release 页面及 `version.json` 中的 SHA-256。

当前版本为 `1.0.15`（versionCode `16`）：

- 包名：`cn.lightrail.fitnessokr`
- SHA-256：`0942067CD732513A220731CAC9EF8B14DDC5DE4CD93013D05B0DD6FBA7F336CB`
- 签名：APK Signature Scheme v2、v3

## 在线更新机制

客户端只会在用户点击时读取本仓库根目录的 [`version.json`](./version.json)。它不会上传训练数据，也不会静默安装 APK。发现较新版本后，会验证包名、版本号、固定 Release 路径和 SHA-256 格式，再由系统浏览器下载并由 Android 系统安装器向用户确认安装。

更新 APK 时，请先重新构建、验证签名并计算 SHA-256；再上传 Release 附件，最后同步更新 `version.json` 的版本号、下载地址和校验值。

表单草稿仅存储在当前设备的本地存储中，不会随版本检查或发布上传。
