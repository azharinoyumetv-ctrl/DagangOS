$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$sdk=Join-Path $root 'GerainaOS/android-sdk'
$avdRoot=Join-Path $sdk 'avd'
$name='DagangOS_Companion_API_34'
$target=Join-Path $avdRoot "$name.avd"
$adb=Join-Path $env:USERPROFILE 'AppData/Local/Android/Sdk/platform-tools/adb.exe'
if (!(Test-Path -LiteralPath $target)) {
    New-Item -ItemType Directory -Path $target | Out-Null
    $config=[IO.File]::ReadAllText((Join-Path $avdRoot 'Geraina_API_34.avd/config.ini')).Replace('AvdId=Geraina_API_34',"AvdId=$name")
    [IO.File]::WriteAllText((Join-Path $target 'config.ini'),$config)
    [IO.File]::WriteAllText((Join-Path $avdRoot "$name.ini"),"avd.ini.encoding=UTF-8`npath=$target`ntarget=android-34`n")
}
& $adb -s emulator-5570 emu kill 2>$null | Out-Null
Start-Sleep -Seconds 3
$env:ANDROID_AVD_HOME=$avdRoot
$env:ANDROID_SDK_ROOT=$sdk
$env:ANDROID_HOME=$sdk
$env:ANDROID_USER_HOME=Join-Path $sdk 'user-home'
$logs=Join-Path $root 'tmp/companion-native'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
Start-Process -FilePath (Join-Path $sdk 'emulator/emulator.exe') -ArgumentList @('-avd',$name,'-port','5570','-no-window','-no-audio','-no-boot-anim','-no-snapshot','-gpu','swiftshader','-memory','2048','-cores','4','-no-metrics') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logs 'emulator-stdout.txt') -RedirectStandardError (Join-Path $logs 'emulator-stderr.txt') | Out-Null
$deadline=(Get-Date).AddMinutes(4)
do {
    Start-Sleep -Seconds 3
    $booted=& $adb -s emulator-5570 shell getprop sys.boot_completed 2>$null
} while ($booted -ne '1' -and (Get-Date) -lt $deadline)
if($booted -ne '1') { throw 'Fresh test device did not finish booting.' }
& $adb -s emulator-5570 shell input keyevent 82
Write-Output 'Fresh companion-app test device is ready. Original AVD data was preserved.'
