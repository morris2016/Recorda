# Downloads a static FFmpeg build (gyan.dev essentials) and stages ffmpeg.exe + ffprobe.exe
# into resources\bin so the app can spawn them as a sidecar.
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$binDir = Join-Path $root "resources\bin"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null

$ffmpegExe = Join-Path $binDir "ffmpeg.exe"
$ffprobeExe = Join-Path $binDir "ffprobe.exe"

if ((Test-Path $ffmpegExe) -and (Test-Path $ffprobeExe)) {
    Write-Host "[recorda] ffmpeg already present at $binDir"
    exit 0
}

$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$tmpZip = Join-Path $env:TEMP "ffmpeg-recorda.zip"
$tmpDir = Join-Path $env:TEMP "ffmpeg-recorda-extract"

Write-Host "[recorda] downloading ffmpeg-release-essentials.zip ..."
Invoke-WebRequest -Uri $url -OutFile $tmpZip -UseBasicParsing

if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
Write-Host "[recorda] extracting ..."
Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpDir -Force

$src = Get-ChildItem -Path $tmpDir -Recurse -Include ffmpeg.exe,ffprobe.exe -File
foreach ($f in $src) {
    Copy-Item -Force $f.FullName -Destination $binDir
    Write-Host "[recorda] staged $($f.Name)"
}

Remove-Item -Force $tmpZip
Remove-Item -Recurse -Force $tmpDir

Write-Host "[recorda] done. ffmpeg.exe -> $ffmpegExe"
