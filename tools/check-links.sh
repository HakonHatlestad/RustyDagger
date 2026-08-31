#!/usr/bin/env bash
# Every relative markdown link in the given files, resolved against the file's own directory.
for f in "$@"; do
  dir=$(dirname "$f")
  grep -oE '\]\([^)]+\)' "$f" | sed -E 's/^\]\((.*)\)$/\1/' | while read -r link; do
    case "$link" in http*|mailto:*|\#*) continue;; esac
    target=${link%%#*}; anchor=${link#*#}
    [ "$anchor" = "$link" ] && anchor=""
    path="$dir/$target"
    if [ ! -e "$path" ]; then echo "BROKEN PATH: $f -> $link"; continue; fi
    if [ -n "$anchor" ]; then
      slugs=$(grep -E '^#{1,6} ' "$path" | sed -E 's/^#+ //' | tr '[:upper:]' '[:lower:]' \
              | sed -E 's/[^a-z0-9 -]//g; s/ /-/g')
      echo "$slugs" | grep -qx -- "$anchor" || echo "BROKEN ANCHOR: $f -> $link"
    fi
  done
done
