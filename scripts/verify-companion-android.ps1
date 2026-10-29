param([string]$Serial='emulator-5570',[switch]$FallbackOnly)
$ErrorActionPreference='Stop'
if ($Serial -ne 'emulator-5570') { throw 'This fixture suite only targets the isolated Android 14 emulator.' }
$root=Split-Path -Parent $PSScriptRoot
$adb=Join-Path $env:USERPROFILE 'AppData/Local/Android/Sdk/platform-tools/adb.exe'
$evidence=Join-Path $root 'tmp/companion-native'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
function AdbRun([string[]]$Arguments) {
    & $adb -s $Serial @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Android operation failed: $($Arguments[0])" }
}
$apps=@(
    @{Module='dapuros';Repo='DapurOS';Version='1.0.2';File='DapurOS-POS-1.0.2.apk';Namespace='dapurospos'},
    @{Module='geraina';Repo='GerainaOS';Version='1.2.17';File='Geraina-POS-1.2.17.apk';Namespace='gerainapos'}
)
function Instrument($app,[string]$method,[string]$profile) {
    $log=Join-Path $evidence "$($app.Module)-$profile-$method.txt"
    $result=& $adb -s $Serial shell am instrument -w -r -e profile $profile -e class "com.example.$($app.Namespace).CompanionSessionTest#$method" "com.dagangos.$($app.Module).test/androidx.test.runner.AndroidJUnitRunner" 2>&1
    $result | Set-Content -LiteralPath $log
    if ($LASTEXITCODE -ne 0 -or !($result -join "`n").Contains('OK (1 test)')) { throw "Device test failed; see $log" }
    Write-Output "$($app.Module) $profile $method passed"
}
function InstalledHash($app) {
    $installed=(& $adb -s $Serial shell pm path "com.dagangos.$($app.Module)" | Select-Object -First 1) -replace '^package:',''
    $hash=((& $adb -s $Serial shell sha256sum $installed) -split '\s+')[0].ToLower()
    $expected=(Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root "$($app.Repo)/android-app/releases/$($app.File)")).Hash.ToLower()
    if($hash -ne $expected) { throw 'Installed app differs from the release APK.' }
    return $hash
}
try {
    # Fixture accounts cannot contact production while the companion process runs.
    AdbRun @('shell','svc','wifi','disable')
    AdbRun @('shell','svc','data','disable')
    AdbRun @('shell','wm','size','1080x2400')
    AdbRun @('shell','wm','density','420')
    AdbRun @('shell','settings','put','system','accelerometer_rotation','0')
    AdbRun @('shell','settings','put','system','user_rotation','0')
    foreach($app in $apps) {
        AdbRun @('install','-r',(Join-Path $root "$($app.Repo)/android-app/releases/$($app.File)"))
        AdbRun @('install','-r',(Join-Path $root "$($app.Repo)/android-app/app/build/outputs/apk/androidTest/release/app-release-androidTest.apk"))
        if (!$FallbackOnly) { Instrument $app 'seedSession' 'seed' }
    }
    $profiles=if($FallbackOnly){@()}else{@(
        @{Name='phone';Size='1080x2400';Density='420';Rotation='0'},
        @{Name='xiaomi-landscape';Size='2032x3048';Density='320';Rotation='1'},
        @{Name='samsung-landscape';Size='1848x2960';Density='240';Rotation='1'}
    )}
    foreach($profile in $profiles) {
        AdbRun @('shell','wm','size',$profile.Size)
        AdbRun @('shell','wm','density',$profile.Density)
        AdbRun @('shell','settings','put','system','accelerometer_rotation','0')
        AdbRun @('shell','settings','put','system','user_rotation',$profile.Rotation)
        foreach($app in $apps) {
            Instrument $app 'companionRoundTripPreservesSessionAndDocument' $profile.Name
            $dest=Join-Path $evidence "$($app.Module)-$($profile.Name).json"
            AdbRun @('pull',"/sdcard/Android/data/com.dagangos.$($app.Module)/files/companion-verification/$($profile.Name)/verification.json",$dest)
            $row=Get-Content -Raw -LiteralPath $dest | ConvertFrom-Json
            $row | Add-Member -NotePropertyName apkSha256 -NotePropertyValue (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root "$($app.Repo)/android-app/releases/$($app.File)")).Hash.ToLower()
            $row | Add-Member -NotePropertyName installedApkSha256 -NotePropertyValue (InstalledHash $app)
            $row | Add-Member -NotePropertyName version -NotePropertyValue $app.Version
            $row | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $dest
        }
    }
    AdbRun @('shell','wm','size','1080x2400')
    AdbRun @('shell','wm','density','420')
    AdbRun @('shell','settings','put','system','user_rotation','0')
    foreach($app in $apps) {
        Instrument $app 'unavailableColdStartRetriesWithoutLosingSession' 'startup-recovery'
        AdbRun @('pull',"/sdcard/Android/data/com.dagangos.$($app.Module)/files/companion-verification/startup-recovery/verification.json",(Join-Path $evidence "$($app.Module)-startup-recovery.json"))
        $file=Join-Path $evidence "$($app.Module)-startup-recovery.json"
        $row=Get-Content -Raw -LiteralPath $file | ConvertFrom-Json
        $row | Add-Member -NotePropertyName installedApkSha256 -NotePropertyValue (InstalledHash $app)
        $row | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $file
    }
    foreach($app in $apps) {
        $other=if($app.Module -eq 'dapuros'){'geraina'}else{'dapuros'}
        AdbRun @('shell','pm','disable-user','--user','0',"com.dagangos.$other")
        try { Instrument $app 'missingCompanionOffersDownloadBrowserAndCancel' 'phone-missing' }
        finally { AdbRun @('shell','pm','enable',"com.dagangos.$other") }
    }
} finally {
    AdbRun @('shell','svc','wifi','enable')
    AdbRun @('shell','svc','data','enable')
}
