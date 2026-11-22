#!/bin/sh
# Downloads the Whisper model on the first start (into the /models volume), checks it, starts the aligner.
set -eu

MODEL="${WHISPER_MODEL:-/models/ggml-small.bin}"
SMALL_SHA256="1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b"

if [ ! -f "$MODEL" ]; then
  if [ "$(basename "$MODEL")" != "ggml-small.bin" ]; then
    echo "Model $MODEL not found: put it into the /models volume." >&2
    exit 1
  fi
  echo "Downloading the Whisper small model (~470 MB)..."
  curl -fL -o "$MODEL.part" https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
  echo "$SMALL_SHA256  $MODEL.part" | sha256sum -c -
  mv "$MODEL.part" "$MODEL"
fi

exec /app/aligner
