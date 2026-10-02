param(
  [string]$FilePath = "C:\WinThor\Exportacoes\ForaDeLinha\produtos_fora_de_linha.xls",
  [string]$DashboardUrl = $(if ([string]::IsNullOrWhiteSpace($env:WINTHOR_DASHBOARD_URL)) { "https://catalogo-pro-sepia.vercel.app" } else { $env:WINTHOR_DASHBOARD_URL }),
  [string]$Token = "",
  [string]$ProjectEnvFile = (Join-Path $PSScriptRoot "..\.env.local")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FilePath)) {
  throw "Planilha nao encontrada: $FilePath"
}
if ([string]::IsNullOrWhiteSpace($DashboardUrl)) {
  throw "Defina WINTHOR_DASHBOARD_URL com a URL publica do dashboard."
}
if (-not $PSBoundParameters.ContainsKey("Token") -and (Test-Path -LiteralPath $ProjectEnvFile)) {
  $envLines = Get-Content -LiteralPath $ProjectEnvFile
  $tokenLine = $envLines | Where-Object {
    $_ -match '^\s*WINTHOR_SYNC_TOKEN\s*='
  } | Select-Object -First 1
  if (-not $tokenLine) {
    $tokenLine = $envLines | Where-Object {
      $_ -match '^\s*N8N_REPROCESS_TOKEN\s*='
    } | Select-Object -First 1
  }
  if ($tokenLine) {
    $Token = ($tokenLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
  }
}
if ([string]::IsNullOrWhiteSpace($Token)) {
  $Token = if (-not [string]::IsNullOrWhiteSpace($env:WINTHOR_SYNC_TOKEN)) {
    $env:WINTHOR_SYNC_TOKEN
  } else {
    $env:N8N_REPROCESS_TOKEN
  }
}
if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "Defina WINTHOR_SYNC_TOKEN ou N8N_REPROCESS_TOKEN com o token configurado no dashboard."
}

$excel = $null
$workbook = $null
$worksheet = $null
try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  $workbook = $excel.Workbooks.Open($FilePath, 0, $true)
  $worksheet = $workbook.Worksheets.Item(1)
  $values = $worksheet.UsedRange.Value2

  if ($null -eq $values -or $values.GetLength(0) -lt 2) {
    throw "A planilha esta vazia ou nao possui linhas de produtos."
  }
  $codeHeader = [string]$values[1, 1]
  $descriptionHeader = [string]$values[1, 2]
  $expectedCodeHeader = "C$([char]0x00F3)digo"
  $expectedDescriptionHeader = "Descri$([char]0x00E7)$([char]0x00E3)o"
  if ($codeHeader.Trim() -ne $expectedCodeHeader -or $descriptionHeader.Trim() -ne $expectedDescriptionHeader) {
    throw "Cabecalho invalido. Esperado: Codigo | Descricao."
  }

  $products = [System.Collections.Generic.List[object]]::new()
  for ($row = 2; $row -le $values.GetLength(0); $row++) {
    $sku = ([string]$values[$row, 1]).Trim()
    if ([string]::IsNullOrWhiteSpace($sku)) { continue }
    $products.Add([ordered]@{
      sku = $sku
      description = ([string]$values[$row, 2]).Trim()
    })
  }
  if ($products.Count -eq 0) {
    throw "Nenhum codigo de produto valido foi encontrado."
  }

  $endpoint = "$($DashboardUrl.TrimEnd('/'))/api/winthor-products"
  $body = @{
    sourceFile = [IO.Path]::GetFileName($FilePath)
    products = $products
  } | ConvertTo-Json -Depth 4 -Compress
  try {
    $result = Invoke-RestMethod -Method Post -Uri $endpoint -Headers @{
      "x-pitterpan-token" = $Token
    } -ContentType "application/json; charset=utf-8" -Body $body
  } catch {
    $statusCode = if ($_.Exception.Response) {
      [int]$_.Exception.Response.StatusCode
    } else {
      "desconhecido"
    }
    throw "Falha ao enviar a sincronizacao (HTTP $statusCode). Verifique se o token local e o token Production da Vercel sao iguais e se o ultimo deploy esta Ready."
  }
  Write-Output "Sincronizacao concluida: $($result.synchronized) produtos fora de linha."
}
finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  if ($worksheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($worksheet) }
  if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
}
