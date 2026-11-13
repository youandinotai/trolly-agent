$ErrorActionPreference = 'Continue'
# Launch Trolly Agent on the desktop (visible window, not headless).
# Everything stays on D: — the app redirects its own userData/temp/logs to D:\Trolly\app\data.

$root = 'D:\Trolly\app'
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'

if (-not (Test-Path $electron)) { Write-Output "MISSING electron: $electron"; exit 1 }
if (-not (Test-Path (Join-Path $root 'dist\renderer\index.html'))) { Write-Output 'renderer not built'; exit 1 }

$env:TROLLY_DATA_DIR = Join-Path $root 'data'

Write-Output 'launching Trolly Agent...'
$args = @('.')
if ($env:TROLLY_DEBUG_PORT) { $args = @('.', "--remote-debugging-port=$($env:TROLLY_DEBUG_PORT)") }
$p = Start-Process -FilePath $electron -ArgumentList $args -WorkingDirectory $root -PassThru
Write-Output ("pid: " + $p.Id)
Start-Sleep -Seconds 12
Get-Process -Id $p.Id -ErrorAction SilentlyContinue | Select-Object Id, MainWindowTitle | Format-Table -AutoSize | Out-String
