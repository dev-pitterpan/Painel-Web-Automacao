$ErrorActionPreference = "Stop"

$folder = Join-Path $env:LOCALAPPDATA "PitterPan"
$path = Join-Path $folder "winthor-oracle-credential.xml"
New-Item -ItemType Directory -Path $folder -Force | Out-Null

$secret = Read-Host "Senha Oracle do usuario loja" -AsSecureString
if ($secret.Length -eq 0) { throw "Senha vazia." }
$credential = New-Object System.Management.Automation.PSCredential("loja", $secret)
$credential | Export-Clixml -LiteralPath $path

Write-Output "Credencial Oracle protegida para este usuario do Windows em $path"
