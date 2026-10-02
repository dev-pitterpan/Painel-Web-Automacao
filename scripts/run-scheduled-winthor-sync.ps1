$ErrorActionPreference = "Stop"

$exportFile = "C:\WinThor\Exportacoes\ForaDeLinha\produtos_fora_de_linha.xls"
$flowUri = "ms-powerautomate:/console/flow/run?environmentid=one-drive-environment-Id&workflowid=a03cea9f-2a51-4cde-8bde-c689848ce594&source=ScheduledTask"
$startedAt = Get-Date

Start-Process $flowUri

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$root = [System.Windows.Automation.AutomationElement]::RootElement
$buttonType = [System.Windows.Automation.ControlType]::Button

function Invoke-PowerAutomateButton {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ButtonName,
    [int]$TimeoutSeconds = 60
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $typeCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      $buttonType
    )
    $nameCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      $ButtonName
    )
    $condition = New-Object System.Windows.Automation.AndCondition(
      $typeCondition,
      $nameCondition
    )
    $button = $root.FindFirst(
      [System.Windows.Automation.TreeScope]::Descendants,
      $condition
    )

    if ($null -ne $button) {
      $buttonProcess = Get-Process -Id $button.Current.ProcessId -ErrorAction SilentlyContinue
      if ($null -ne $buttonProcess -and $buttonProcess.ProcessName -like "PAD.Console*") {
        $invoke = $button.GetCurrentPattern(
          [System.Windows.Automation.InvokePattern]::Pattern
        )
        $invoke.Invoke()
        return
      }
    }
    Start-Sleep -Milliseconds 500
  }
  throw "O botão '$ButtonName' do Power Automate não foi localizado em $TimeoutSeconds segundos."
}

function Wait-ExportedFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [datetime]$After,
    [int]$TimeoutMinutes = 20
  )

  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  $lastLength = -1
  $stableChecks = 0
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path) {
      $file = Get-Item -LiteralPath $Path
      if ($file.LastWriteTime -ge $After -and $file.Length -gt 0) {
        if ($file.Length -eq $lastLength) { $stableChecks++ } else { $stableChecks = 0 }
        $lastLength = $file.Length
        if ($stableChecks -ge 2) { return }
      }
    }
    Start-Sleep -Seconds 3
  }
  throw "A exportação do WinThor não foi concluída em $TimeoutMinutes minutos."
}

Invoke-PowerAutomateButton -ButtonName "Continuar"
Invoke-PowerAutomateButton -ButtonName "OK"
Wait-ExportedFile -Path $exportFile -After $startedAt

& (Join-Path $PSScriptRoot "sync-winthor-status.ps1") -FilePath $exportFile
