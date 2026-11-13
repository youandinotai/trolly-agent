$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) { throw "Electron runtime missing: $electron" }
if (-not (Test-Path (Join-Path $root 'dist\electron\main.js'))) { throw 'Build Trolly Agent before installing autostart.' }

$action = New-ScheduledTaskAction -Execute $electron -Argument '.' -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$task = New-ScheduledTask -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Trolly Agent local avatar studio; all application files remain on D:.'
Register-ScheduledTask -TaskName 'Trolly Agent' -InputObject $task -Force | Out-Null
$installed = Get-ScheduledTask -TaskName 'Trolly Agent'
[PSCustomObject]@{
  TaskName = $installed.TaskName
  State = $installed.State
  Execute = $installed.Actions.Execute
  WorkingDirectory = $installed.Actions.WorkingDirectory
  LogonType = $installed.Principal.LogonType
}
