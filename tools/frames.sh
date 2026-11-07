#!/bin/sh
# Stills of the cartoon at event indices: tools/frames.sh OUTDIR 0 1 2 ...  (needs a server on :8765)
OUT=$1; shift
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p "$OUT"
for E in "$@"; do
  "$CH" --headless --disable-gpu --hide-scrollbars --window-size=1300,1000 --virtual-time-budget=2500 \
    --screenshot="$OUT/e$E.png" "http://127.0.0.1:8765/?ev=$E&p=${P:-0.6}" >/dev/null 2>&1
done
