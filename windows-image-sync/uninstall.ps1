$ErrorActionPreference = "Stop"
$taskName = "Pitter Pan - Sincronizar Imagens"
$installDir = Join-Path $env:LOCALAPPDATA "PitterPanImageSync"

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

if (Test-Path -LiteralPath $installDir) {
  Remove-Item -LiteralPath $installDir -Recurse -Force
}

Write-Host "Sincronizador removido." -ForegroundColor Green
