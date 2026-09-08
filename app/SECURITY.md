<!-- 修改时间：2026-08-20 16:00:02 +08:00；目的：记录 Android 离线版的安全边界、依赖来源和可复核措施。 -->
# 轻铁训练 Android 安全说明

## 数据边界

- 训练、OKR、复盘和知识点仅写入 Android 应用沙箱内的 WebView Local Storage。
- Manifest 不声明网络、定位、通讯录、短信、相机、麦克风或外部存储权限。
- 禁止系统云备份和设备迁移导出；卸载应用会删除本地数据，因此应用内提供复制/粘贴 JSON 备份。

## 代码与网络

- 页面资源全部随 APK 打包，不加载 CDN、远程字体或远程脚本。
- CSP 使用 `connect-src 'none'`，Android 同时禁止明文流量。
- WebView 关闭文件访问、内容访问、混合内容、自动开窗和多窗口；正式包关闭 WebView 调试。
- 不包含 Supabase、广告、统计、推送或动态代码下载。

## 供应链与签名

- Capacitor 依赖由 npm lockfile 固定，并执行 `npm audit`。
- Android SDK 只从 Google 官方下载，并按官网 SHA-256 校验。
- 正式签名口令由 Windows DPAPI 加密保存，只能由当前 Windows 用户解密；源码和日志不保存明文口令。
- 交付前检查最终权限、签名证书、APK SHA-256，并使用 Windows Defender 扫描。

这些措施能显著降低恶意代码、越权和数据外传风险，但任何软件都无法诚实地承诺绝对零风险。安装前可再次核对交付的 SHA-256。
