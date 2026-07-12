#!/usr/bin/env bash
# Operations-Agents — Stop-hook backstop logger (macOS/Linux variant of log-run.ps1).
# Appends a minimal "a session ended" row to runs/raw-events.jsonl. The structured
# ledger.jsonl written by the parent at /build close-out is the primary signal.
set -euo pipefail
stdin="$(cat || true)"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
tp="$(printf '%s' "$stdin" | sed -n 's/.*"transcript_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
sid="$(printf '%s' "$stdin" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
runs="$(cd "$(dirname "$0")/../runs" && pwd)"
printf '{"ts":"%s","event":"stop","session":"%s","transcript":"%s","structured":false}\n' "$ts" "$sid" "$tp" >> "$runs/raw-events.jsonl"
