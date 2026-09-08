package cn.lightrail.fitnessokr;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// 修改时间：2026-09-08 10:20:00 +08:00；目的：仅允许打开本项目 GitHub Release 的 HTTPS APK 链接，并交给系统浏览器下载及确认安装。
@CapacitorPlugin(name = "UpdateLauncher")
public class UpdateLauncherPlugin extends Plugin {
    private static final String TRUSTED_HOST = "github.com";
    private static final String TRUSTED_RELEASE_PREFIX = "/lorangedd/light-rail-fitness-android/releases/download/";

    @PluginMethod
    public void openRelease(PluginCall call) {
        String rawUrl = call.getString("url");
        Uri uri = rawUrl == null ? null : Uri.parse(rawUrl);
        String path = uri == null ? null : uri.getPath();
        boolean trusted = uri != null
            && "https".equalsIgnoreCase(uri.getScheme())
            && TRUSTED_HOST.equalsIgnoreCase(uri.getHost())
            && uri.getPort() == -1
            && uri.getUserInfo() == null
            && path != null
            && path.startsWith(TRUSTED_RELEASE_PREFIX)
            && path.endsWith(".apk");
        if (!trusted) {
            call.reject("更新链接未通过安全校验");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException exception) {
            call.reject("设备没有可用于打开下载页的浏览器", exception);
        }
    }
}
