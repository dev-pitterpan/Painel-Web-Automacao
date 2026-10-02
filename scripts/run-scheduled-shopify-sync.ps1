$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot "sync-shopify-catalog.mjs"
$nodeExecutable = "C:\Program Files\nodejs\node.exe"
$logDirectory = Join-Path $env:LOCALAPPDATA "PitterPan\logs"
$logFile = Join-Path $logDirectory "shopify-catalog-sync.log"

New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

if (-not (Test-Path -LiteralPath $nodeExecutable)) {
  throw "Node.js não foi encontrado em '$nodeExecutable'."
}

if (-not (Test-Path -LiteralPath $syncScript)) {
  throw "O sincronizador não foi encontrado em '$syncScript'."
}

Set-Location -LiteralPath $projectRoot

$startedAt = Get-Date
Add-Content -LiteralPath $logFile -Value "[$($startedAt.ToString('s'))] Sincronização iniciada."

& $nodeExecutable $syncScript *>> $logFile
$exitCode = $LASTEXITCODE

$finishedAt = Get-Date
Add-Content -LiteralPath $logFile -Value "[$($finishedAt.ToString('s'))] Sincronização finalizada com código $exitCode."

if ($exitCode -ne 0) {
  throw "A sincronização do catálogo terminou com código $exitCode. Consulte '$logFile'."
}
