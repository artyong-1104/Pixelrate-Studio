#!/usr/bin/env bash
set -euo pipefail

mkdir -p references/raw

urls=(
'https://gall.dcinside.com/mgallery/board/view/?id=ai_utilize&no=8456&exception_mode=recommend&s_type=search_subject_memo&s_keyword=%ED%94%BD%EC%85%80&page=1'
'https://gall.dcinside.com/mgallery/board/view/?id=ai_utilize&no=8045&exception_mode=recommend&s_type=search_subject_memo&s_keyword=%ED%94%BD%EC%85%80&page=1'
'https://gall.dcinside.com/mgallery/board/view/?id=ai_utilize&no=7980&exception_mode=recommend&s_type=search_subject_memo&s_keyword=%ED%94%BD%EC%85%80&page=1'
'https://gall.dcinside.com/mgallery/board/view/?id=game_dev&no=214752'
'https://www.spritefusion.com/pixel-snapper'
'https://masuone.itch.io/pixel-after-all'
'https://gall.dcinside.com/mgallery/board/view/?id=ai_utilize&no=22781&exception_mode=recommend&page=1'
'https://gall.dcinside.com/mgallery/board/view/?id=ai_utilize&no=22558&exception_mode=recommend&page=1'
)

for i in "${!urls[@]}"; do
  n=$(printf '%02d' "$((i + 1))")
  out="references/raw/source-${n}.html"
  echo "Fetching source ${n}..."
  curl -L --fail --compressed \
    -A 'Mozilla/5.0 (compatible; PixelizerResearch/1.0)' \
    --connect-timeout 15 \
    --max-time 60 \
    "${urls[$i]}" \
    -o "$out" || echo "FAILED source ${n}: ${urls[$i]}" >&2
done
