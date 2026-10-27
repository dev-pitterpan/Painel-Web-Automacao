param([switch]$DryRun)

$ErrorActionPreference = "Stop"
$projectRoot = "\\10.130.1.5\Administrativo2\PROJETOS\vitor\catalogo-pro"
$credentialPath = Join-Path $env:LOCALAPPDATA "PitterPan\winthor-oracle-credential.xml"
$logDirectory = Join-Path $env:LOCALAPPDATA "PitterPan\logs"
$logPath = Join-Path $logDirectory "winthor-oracle-sync.log"

if (-not (Test-Path -LiteralPath $credentialPath)) {
  throw "Credencial Oracle local nao encontrada. Execute setup-winthor-oracle-credential.ps1."
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "scripts\sync-winthor-oracle.mjs"))) {
  throw "Projeto WinThor nao encontrado na pasta de rede."
}
$credential = Import-Clixml -LiteralPath $credentialPath
if ($credential.UserName -ne "loja") { throw "Usuario Oracle inesperado na credencial local." }

$envFile = Join-Path $projectRoot ".env.local"
$tokenLine = Get-Content -LiteralPath $envFile | Where-Object {
  $_ -match '^\s*WINTHOR_SYNC_TOKEN\s*='
} | Select-Object -First 1
if (-not $tokenLine) { throw "WINTHOR_SYNC_TOKEN nao encontrado no projeto." }
$token = ($tokenLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
if (-not $token) { throw "WINTHOR_SYNC_TOKEN esta vazio." }

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$env:ORACLE_PASSWORD = $credential.GetNetworkCredential().Password
$env:WINTHOR_SYNC_TOKEN = $token
try {
  Push-Location -LiteralPath $projectRoot
  try {
    $arguments = @("scripts\sync-winthor-oracle.mjs")
    if ($DryRun) { $arguments += "--dry-run" }
    "$(Get-Date -Format o) Inicio da sincronizacao Oracle (teste: $DryRun)." |
      Out-File -FilePath $logPath -Append -Encoding utf8
    & "C:\Program Files\nodejs\node.exe" @arguments 2>&1 |
      Out-File -FilePath $logPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
      throw "Sincronizacao Oracle falhou com codigo $LASTEXITCODE. Consulte $logPath"
    }
    "$(Get-Date -Format o) Sincronizacao Oracle concluida." |
      Out-File -FilePath $logPath -Append -Encoding utf8
  } finally {
    Pop-Location
  }
} finally {
  Remove-Item Env:ORACLE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:WINTHOR_SYNC_TOKEN -ErrorAction SilentlyContinue
}
