param(
  [string]$FilePath = "C:\WinThor\Exportacoes\ForaDeLinha\produtos_fora_de_linha.xls",
  [string]$DashboardUrl = "https://catalogo-pro.vercel.app",
  [string]$Token = $env:WINTHOR_SYNC_TOKEN,
  [string]$ProjectEnvFile = (Join-Path $PSScriptRoot "..\.env.local")
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $FilePath)) {
  throw "Planilha não encontrada: $FilePath"
}
if ([string]::IsNullOrWhiteSpace($DashboardUrl)) {
  throw "Defina WINTHOR_DASHBOARD_URL com a URL pública do dashboard."
}
if ([string]::IsNullOrWhiteSpace($Token) -and (Test-Path -LiteralPath $ProjectEnvFile)) {
  $tokenLine = Get-Content -LiteralPath $ProjectEnvFile | Where-Object {
    $_ -match '^\s*(WINTHOR_SYNC_TOKEN|N8N_REPROCESS_TOKEN)\s*='
  } | Select-Object -First 1
  if ($tokenLine) {
    $Token = ($tokenLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
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
    throw "A planilha está vazia ou não possui linhas de produtos."
  }
  $codeHeader = [string]$values[1, 1]
  $descriptionHeader = [string]$values[1, 2]
  if ($codeHeader.Trim() -ne "Código" -or $descriptionHeader.Trim() -ne "Descrição") {
    throw "Cabeçalho inválido. Esperado: Código | Descrição."
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
    throw "Nenhum código de produto válido foi encontrado."
  }

  $endpoint = "$($DashboardUrl.TrimEnd('/'))/api/winthor-products"
  $body = @{
    sourceFile = [IO.Path]::GetFileName($FilePath)
    products = $products
  } | ConvertTo-Json -Depth 4 -Compress
  $result = Invoke-RestMethod -Method Post -Uri $endpoint -Headers @{
    "x-pitterpan-token" = $Token
  } -ContentType "application/json; charset=utf-8" -Body $body
  Write-Output "Sincronização concluída: $($result.synchronized) produtos fora de linha."
}
finally {
  if ($workbook) { $workbook.Close($false) }
  if ($excel) { $excel.Quit() }
  if ($worksheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($worksheet) }
  if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
  if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
}
