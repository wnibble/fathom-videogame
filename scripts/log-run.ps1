# Operations-Agents — Stop-hook backstop logger.
# Appends a minimal "a session ended" row to runs/raw-events.jsonl so /retro can
# notice runs that didn't go through /build. The structured ledger.jsonl written
# by the parent at /build close-out is the primary signal; this is just a safety net.
$ErrorActionPreference = 'SilentlyContinue'
$stdin = [Console]::In.ReadToEnd()
try { $o = $stdin | ConvertFrom-Json } catch { $o = $null }
$ts  = (Get-Date).ToString('o')
$tp  = if ($o) { $o.transcript_path } else { '' }
$sid = if ($o) { $o.session_id } else { '' }
$rec = [ordered]@{ ts = $ts; event = 'stop'; session = $sid; transcript = $tp; structured = $false } | ConvertTo-Json -Compress
$runs = Join-Path $PSScriptRoot '..\runs'
if (-not (Test-Path $runs)) { New-Item -ItemType Directory -Path $runs | Out-Null }
Add-Content -Path (Join-Path $runs 'raw-events.jsonl') -Value $rec -Encoding utf8
