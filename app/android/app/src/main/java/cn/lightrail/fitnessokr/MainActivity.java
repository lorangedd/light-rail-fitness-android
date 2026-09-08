package cn.lightrail.fitnessokr;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

// 修改时间：2026-08-21 10:39:12 +08:00；目的：关闭文件访问、混合内容和多窗口，并依据应用标志只允许调试包启用 WebView 调试。
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 修改时间：2026-09-08 10:20:00 +08:00；目的：注册受限更新下载页启动插件，使 Web 层不能任意打开外部链接。
        registerPlugin(UpdateLauncherPlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = bridge.getWebView();
        WebSettings settings = webView.getSettings();
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        boolean debugBuild = (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debugBuild);
    }
}
