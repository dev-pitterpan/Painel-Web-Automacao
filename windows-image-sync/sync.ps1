param([switch]$Once)

$ErrorActionPreference = "Stop"
$installDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $installDir "config.json"
$logPath = Join-Path $installDir "sync.log"

function Write-Log([string]$Message) {
  if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 5MB) {
    Move-Item -LiteralPath $logPath -Destination "$logPath.old" -Force
  }
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $logPath -Value "[$timestamp] $Message" -Encoding UTF8
}

function Send-Acknowledgement($Config, $Results) {
  if ($Results.Count -eq 0) { return }
  $headers = @{ Authorization = "Bearer $($Config.token)" }
  $body = @{ results = $Results } | ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod -Method Post -Uri "$($Config.baseUrl.TrimEnd('/'))/api/image-sync" `
    -Headers $headers -ContentType "application/json" -Body $body | Out-Null
}

function Invoke-SyncCycle($Config) {
  if (-not (Test-Path -LiteralPath $Config.directory -PathType Container)) {
    throw "Diretório indisponível: $($Config.directory)"
  }

  $headers = @{ Authorization = "Bearer $($Config.token)" }
  $response = Invoke-RestMethod -Method Get `
    -Uri "$($Config.baseUrl.TrimEnd('/'))/api/image-sync?limit=10" `
    -Headers $headers
  $jobs = @($response.jobs)
  if ($jobs.Count -eq 0) { return }

  $results = @()
  foreach ($job in $jobs) {
    try {
      if ([string]::IsNullOrWhiteSpace($job.fileName) -or
          $job.fileName -notmatch '^[a-zA-Z0-9._-]+\.jpg$') {
        throw "Nome de arquivo recusado: $($job.fileName)"
      }
      $destination = Join-Path $Config.directory $job.fileName
      if ([string]$job.operation -eq "reorder") {
        $moves = @([string]$job.base64 | ConvertFrom-Json)
        $staged = @()
        foreach ($move in $moves) {
          $sourceName = [string]$move.source
          $destinationName = [string]$move.destination
          if ($sourceName -notmatch '^[a-zA-Z0-9._-]+\.jpg$' -or
              $destinationName -notmatch '^[a-zA-Z0-9._-]+\.jpg$') {
            throw "Nome de arquivo recusado na reordenacao."
          }
          $sourcePath = Join-Path $Config.directory $sourceName
          if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
            $temporaryPath = Join-Path $Config.directory ".$sourceName.$([Guid]::NewGuid().ToString('N')).reorder"
            Move-Item -LiteralPath $sourcePath -Destination $temporaryPath -Force
            $staged += @{ temporary = $temporaryPath; destination = (Join-Path $Config.directory $destinationName) }
          }
        }
        foreach ($file in $staged) {
          Move-Item -LiteralPath $file.temporary -Destination $file.destination -Force
          Write-Log "Reordenado: $($file.destination)"
        }
      } elseif ([string]$job.operation -eq "delete") {
        if (Test-Path -LiteralPath $destination -PathType Leaf) {
          Remove-Item -LiteralPath $destination -Force
          Write-Log "Excluido: $destination"
        } else {
          Write-Log "Exclusao confirmada; arquivo inexistente: $destination"
        }
      } else {
        $bytes = [Convert]::FromBase64String([string]$job.base64)
        if ($bytes.Length -eq 0) { throw "Imagem vazia." }
        $temporary = Join-Path $Config.directory ".$($job.fileName).$([Guid]::NewGuid().ToString('N')).tmp"
        try {
          [IO.File]::WriteAllBytes($temporary, $bytes)
          Move-Item -LiteralPath $temporary -Destination $destination -Force
        } finally {
          if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
          }
        }
        Write-Log "Gravado: $destination ($($bytes.Length) bytes)"
      }
      $results += @{ id = [long]$job.id; success = $true; error = "" }
    } catch {
      $message = $_.Exception.Message
      Write-Log "Erro no job $($job.id): $message"
      $results += @{ id = [long]$job.id; success = $false; error = $message }
    }
  }
  Send-Acknowledgement $Config $results
}

if (-not (Test-Path -LiteralPath $configPath)) {
  throw "Configuração não encontrada em $configPath. Execute install.ps1."
}
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
if (-not $config.baseUrl -or -not $config.token -or -not $config.directory) {
  throw "Configuração incompleta. Execute install.ps1 novamente."
}

do {
  try {
    Invoke-SyncCycle $config
  } catch {
    Write-Log "Falha no ciclo: $($_.Exception.Message)"
  }
  if (-not $Once) {
    Start-Sleep -Seconds ([Math]::Max(10, [int]$config.pollSeconds))
  }
} while (-not $Once)
