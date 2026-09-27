#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${1:-${XANGI_STACKCHAN_DIR:-}}"
VOICE="${AVATAR_VOICE_ROOT:-$ROOT/.voice}"

if [[ -z "$SOURCE" ]]; then
  echo "usage: npm run setup:voice -- /path/to/xangi-stackchan" >&2
  exit 2
fi
if [[ ! -d "$SOURCE/models" || ! -d "$SOURCE/_piper" ]]; then
  echo "xangi-stackchan voice assets were not found: $SOURCE" >&2
  exit 2
fi

mkdir -p "$VOICE/models" "$VOICE/piper"
cp "$SOURCE"/models/*.onnx "$SOURCE"/models/*.json "$VOICE/models/"
cp -a "$SOURCE"/_piper/. "$VOICE/piper/"
if [[ ! -x "$VOICE/venv/bin/python" ]]; then
  uv venv "$VOICE/venv"
  uv pip install --python "$VOICE/venv/bin/python" faster-whisper
fi
echo "Server voice is ready in $VOICE"
