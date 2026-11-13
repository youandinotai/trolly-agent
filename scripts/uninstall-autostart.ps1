$ErrorActionPreference = 'Stop'
Unregister-ScheduledTask -TaskName 'Trolly Agent' -Confirm:$false
Write-Output 'Removed Windows logon task: Trolly Agent'
