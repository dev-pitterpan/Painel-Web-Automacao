$ErrorActionPreference = "Stop"
$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA "PitterPanImageSync"
$taskName = "Pitter Pan - Sincronizar Imagens"
$defaultUrl = "https://catalogo-pro-sepia.vercel.app"
$defaultDirectory = "W:\IMG\produtos"

Write-Host "Instalador do Sincronizador de Imagens Pitter Pan" -ForegroundColor Cyan
$baseUrl = Read-Host "URL do painel [$defaultUrl]"
if ([string]::IsNullOrWhiteSpace($baseUrl)) { $baseUrl = $defaultUrl }
$directory = Read-Host "Diretório das imagens [$defaultDirectory]"
if ([string]::IsNullOrWhiteSpace($directory)) { $directory = $defaultDirectory }
$tokenSecure = Read-Host "Token do sincronizador" -AsSecureString
$tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($tokenSecure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
}
if ([string]::IsNullOrWhiteSpace($token)) { throw "O token é obrigatório." }
if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
  throw "O diretório não está acessível: $directory"
}

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
}

New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceDir "sync.ps1") `
  -Destination (Join-Path $installDir "sync.ps1") -Force
@{
  baseUrl = $baseUrl.TrimEnd("/")
  directory = $directory
  token = $token
  pollSeconds = 20
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installDir "config.json") -Encoding UTF8

$configPath = Join-Path $installDir "config.json"
& icacls.exe $configPath /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
$scriptPath = Join-Path $installDir "sync.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME `
  -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings `
  -Description "Sincroniza imagens do painel com W:\IMG\produtos" `
  -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Sincronizador instalado em $installDir" -ForegroundColor Green
Write-Host "Tarefa iniciada: $taskName" -ForegroundColor Green
