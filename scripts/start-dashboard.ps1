# Operations-Agents — live dashboard launcher.
# Serves the project folder over http and opens the dashboard. A static server is
# required because browsers block fetch() on file:// URLs (CORS). Zero dependencies
# beyond Python, which ships with most dev machines.
param([int]$Port = 8765)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot   # the Operations-Agents folder
$url  = "http://127.0.0.1:$Port/dashboard/"

# find a Python launcher
$py = $null
foreach ($c in @('py','python','python3')) {
  if (Get-Command $c -ErrorAction SilentlyContinue) { $py = $c; break }
}

if (-not $py) {
  Write-Host "Python not found. Use a server that produces DIRECTORY LISTINGS" -ForegroundColor Yellow
  Write-Host "(the dashboard auto-discovers files from the listing):"
  Write-Host "  Node:  npx --yes serve `"$root`" -l $Port   then open $url"
  Write-Host "  NOTE:  VS Code 'Live Server' does NOT serve directory listings, so the"
  Write-Host "         file tree will not populate there. Prefer python or 'npx serve'."
  exit 1
}

Write-Host "Serving $root" -ForegroundColor Cyan
Write-Host "Dashboard:  $url" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop.`n"

Start-Process $url
if ($py -eq 'py') {
  & py -3 -m http.server $Port --bind 127.0.0.1 --directory "$root"
} else {
  & $py -m http.server $Port --bind 127.0.0.1 --directory "$root"
}
