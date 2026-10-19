# HarooLife - build de production locale servie sur le reseau local prive, pour un telephone
# Android relie au meme Wi-Fi. Equivalent Windows de scripts/haroolife-lan.sh. Aucun deploiement.
#
# Usage (PowerShell, a la racine du depot) :
#   powershell -ExecutionPolicy Bypass -File scripts\haroolife-lan.ps1             # construit puis sert
#   powershell -ExecutionPolicy Bypass -File scripts\haroolife-lan.ps1 -NoBuild    # sert la build existante
#   powershell -ExecutionPolicy Bypass -File scripts\haroolife-lan.ps1 -Realtime   # + relais de discussion :3001
# Variables : .env.local (lu par Next.js) ou les NEXT_PUBLIC_* exportees avant de lancer.
#
# La page est servie en http depuis l'IP du PC : la build LAN retire "upgrade-insecure-requests"
# de la CSP (HAROOLIFE_LAN_HTTP=1), sinon le telephone reecrirait chaque fichier en https.
param(
  [switch]$NoBuild,
  [switch]$Realtime,
  [int]$Port = 3000
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

# Adresse IPv4 du PC sur le Wi-Fi ou l'Ethernet (pas les adaptateurs virtuels ni 169.254.x.x).
$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|VirtualBox|VMware|Loopback' } |
  Sort-Object -Property @{ Expression = { if ($_.InterfaceAlias -match 'Wi-?Fi') { 0 } else { 1 } } } |
  Select-Object -First 1 -ExpandProperty IPAddress
if (-not $ip) { $ip = '<ip-du-pc>' }

$env:HAROOLIFE_LAN_HTTP = '1'
if ($Realtime) { $env:NEXT_PUBLIC_HAROOLIFE_REALTIME_URL = "http://${ip}:3001" }

if (-not $NoBuild) {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw 'La build a echoue.' }
}

$relay = $null
if ($Realtime) {
  $env:HAROOLIFE_REALTIME_ORIGINS = "http://${ip}:${Port},http://localhost:${Port}"
  $relay = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'realtime' -PassThru -NoNewWindow
}

Write-Host ''
Write-Host 'HarooLife - production locale'
Write-Host "  PC  : http://localhost:${Port}/haroolife"
Write-Host "  Tel : http://${ip}:${Port}/haroolife?diag=1   (meme Wi-Fi)"
if ($Realtime) { Write-Host "  Discussion : relais http://${ip}:3001" }
Write-Host '  Pare-feu (une fois, PowerShell administrateur) :'
Write-Host "    New-NetFirewallRule -DisplayName 'HarooLife LAN' -Direction Inbound -Protocol TCP -LocalPort ${Port},3001 -Action Allow -Profile Private"
Write-Host '  Mesures : chrome://inspect sur le PC -> console : __LOME_PERF_RESET() ... copy(JSON.stringify(__LOME_PERF))'
Write-Host ''
try {
  npx next start --hostname 0.0.0.0 --port $Port
} finally {
  if ($relay -and -not $relay.HasExited) { Stop-Process -Id $relay.Id -Force }
}
