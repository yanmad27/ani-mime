#!/bin/bash
# Claude Code hook script — sends status using the SHELL's PID
# so it controls the same session as the zsh hooks.
STATE="$1"
TYPE="${2:-}"
PID=$(cat /tmp/tauri-shell-pid 2>/dev/null || echo 0)
URL="http://127.0.0.1:1234/status?pid=${PID}&state=${STATE}"
if [[ -n "$TYPE" ]]; then
  URL="${URL}&type=${TYPE}"
fi
curl -s --max-time 1 "$URL" > /dev/null 2>&1
