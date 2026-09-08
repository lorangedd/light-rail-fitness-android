# 修改时间：2026-08-21 09:52:15 +08:00；目的：自动识别已安装的 Oracle JDK 21，并稳健读取带换行的 DPAPI 签名口令后构建正式 APK，全程不输出明文口令。
[CmdletBinding()]
param(
    [string]$ToolchainRoot = 'D:\Codex workspace\android-toolchain',
    [string]$DeliveryRoot = 'D:\Codex workspace\轻铁训练-Android'
)

$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$jdkRoot = Join-Path $ToolchainRoot 'jdk-21'
if (-not (Test-Path -LiteralPath $jdkRoot)) {
    $installedJdk = Get-ChildItem -LiteralPath 'C:\Program Files\Java' -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^jdk-21' } | Sort-Object Name -Descending | Select-Object -First 1
    if ($installedJdk) { $jdkRoot = $installedJdk.FullName }
}
$sdkRoot = Join-Path $ToolchainRoot 'android-sdk'
$secretPath = Join-Path $DeliveryRoot 'signing\signing-secret.dpapi'
$keystorePath = Join-Path $DeliveryRoot 'signing\fitness-okr-release.jks'
$apkSource = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
# 修改时间：2026-09-07 18:18:00 +08:00；目的：将本次界面和逻辑对齐版本以独立 1.0.1 文件交付，避免覆盖旧 APK 后难以辨识版本。
# 修改时间：2026-09-07 18:46:00 +08:00；目的：将包含用户指定启动封面的 1.0.2 包使用独立文件名交付，保留之前 APK 供回退。
# 修改时间：2026-09-07 19:05:00 +08:00；目的：将首页鼓励图和本地版本检查入口所在的 1.0.3 包独立交付，保留之前 APK 供回退。
# 修改时间：2026-09-07 19:35:00 +08:00；目的：将本地媒体附件和上半部分封面所在的 1.0.4 包独立交付，保留之前 APK 供回退。
# 修改时间：2026-09-08 09:45:00 +08:00；目的：将知识与设置分离后的 1.0.5 包独立交付，保留之前 APK 供回退。
# 修改时间：2026-09-08 10:20:00 +08:00；目的：将 GitHub 版本清单检查和受限系统下载入口所在的 1.0.6 包独立交付，保留之前 APK 供回退。
# 修改时间：2026-09-08 11:20:00 +08:00；目的：将主动联网边界说明修正后的 1.0.7 包独立交付，保留之前 APK 供回退。
# 修改时间：2026-09-08 18:45:00 +08:00；目的：将知识搜索焦点保持修正版独立交付。
$apkTarget = Join-Path $DeliveryRoot '轻铁训练-v1.0.13-release.apk'

foreach ($required in @($jdkRoot, $sdkRoot, $secretPath, $keystorePath)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "Required build input is missing: $required"
    }
}

$securePassword = (Get-Content -LiteralPath $secretPath -Raw -Encoding UTF8).Trim() | ConvertTo-SecureString
$credential = [pscredential]::new('local-signing', $securePassword)
$plainPassword = $credential.GetNetworkCredential().Password

try {
    $env:JAVA_HOME = $jdkRoot
    $env:ANDROID_HOME = $sdkRoot
    $env:ANDROID_SDK_ROOT = $sdkRoot
    $env:FITNESS_RELEASE_KEYSTORE = $keystorePath
    $env:FITNESS_STORE_PASSWORD = $plainPassword
    $env:FITNESS_KEY_PASSWORD = $plainPassword
    $env:Path = "$jdkRoot\bin;$sdkRoot\platform-tools;$sdkRoot\build-tools\36.0.0;$env:Path"

    Push-Location $projectRoot
    npm exec cap sync android
    Push-Location (Join-Path $projectRoot 'android')
    & .\gradlew.bat clean assembleRelease --no-daemon
    if ($LASTEXITCODE -ne 0) { throw 'Gradle release build failed.' }
    Pop-Location
    Pop-Location

    New-Item -ItemType Directory -Path $DeliveryRoot -Force | Out-Null
    Copy-Item -LiteralPath $apkSource -Destination $apkTarget -Force
    Get-FileHash -LiteralPath $apkTarget -Algorithm SHA256
}
finally {
    $plainPassword = $null
    Remove-Item Env:FITNESS_RELEASE_KEYSTORE, Env:FITNESS_STORE_PASSWORD, Env:FITNESS_KEY_PASSWORD -ErrorAction SilentlyContinue
    while ((Get-Location).Path -ne $projectRoot -and (Get-Location).Path.StartsWith($projectRoot)) { Pop-Location }
}
