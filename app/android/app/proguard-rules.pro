# Add project specific ProGuard rules here.
# 修改时间：2026-08-20 15:46:01 +08:00；目的：保留 Capacitor 桥接入口，同时由 R8 混淆其余正式包代码。
-keep class com.getcapacitor.BridgeActivity { *; }
-keep class cn.lightrail.fitnessokr.MainActivity { *; }
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
